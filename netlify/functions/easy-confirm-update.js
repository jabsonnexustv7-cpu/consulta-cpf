const { verifyPreviewToken } = require('./easy-shared');

const CRM_API_URL = String(
  process.env.CRM_API_URL ||
    'https://webturbo-crm-api-964927461432.southamerica-east1.run.app'
).replace(/\/$/, '');
const CRM_INTEGRATION_TOKEN = process.env.CRM_INTEGRATION_TOKEN;
const CRM_TIMEOUT_MS = 12000;

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify(body)
  };
}

async function crmRequest(path, options = {}) {
  if (!CRM_INTEGRATION_TOKEN) {
    throw new Error('CRM_INTEGRATION_TOKEN não configurado no Netlify.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CRM_TIMEOUT_MS);

  try {
    const response = await fetch(`${CRM_API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${CRM_INTEGRATION_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options.headers || {})
      }
    });

    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      const message =
        data?.message ||
        data?.error?.message ||
        data?.error ||
        `Falha no CRM (${response.status})`;
      const error = new Error(message);
      error.statusCode = response.status;
      error.payload = data;
      throw error;
    }

    return data;
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error(
        'O CRM demorou mais que o esperado para concluir a atualização.'
      );
      timeoutError.statusCode = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return json(405, { error: 'Método não permitido.' });
    }

    const body = JSON.parse(event.body || '{}');
    const previewToken = body?.previewToken;

    if (!previewToken) {
      return json(400, { error: 'Preview token é obrigatório.' });
    }

    const preview = verifyPreviewToken(previewToken);

    if (!preview?.exp || Date.now() > preview.exp) {
      return json(400, { error: 'Preview expirado. Gere um novo preview.' });
    }

    const updatePayload = preview.updatePayload || {};
    const crmResponse = await crmRequest(
      '/api/v1/integrations/manychat/pre-sales/change-holder',
      {
        method: 'POST',
        body: JSON.stringify({
          documentoCliente: updatePayload.documentoCliente,
          nome: updatePayload.nome,
          documentoNovo:
            updatePayload.documentoNovo || updatePayload.documentoCliente,
          dataNascimento: updatePayload.dataNascimento
        })
      }
    );

    return json(200, {
      ok: true,
      message: 'Cliente atualizado com sucesso no CRM.',
      sentPayload: updatePayload,
      crmResponse,
      attemptedAnotherDocument:
        crmResponse?.tentouOutroDocumento === true,
      audit: {
        confirmedAt: new Date().toISOString(),
        documentoAtual: preview.documentoAtual,
        updateMode: preview.updateMode,
        preSaleId: crmResponse?.preSaleId || null,
        preSaleCode: crmResponse?.preSaleCode || null
      }
    });
  } catch (error) {
    return json(error.statusCode || 500, {
      error: error.message || 'Erro interno ao confirmar atualização.',
      details: error.payload || null
    });
  }
};
