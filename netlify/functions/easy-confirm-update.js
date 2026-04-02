const { verifyPreviewToken } = require('./easy-shared');

const EASY_BASE_URL =
  process.env.EASY_BASE_URL || 'https://easy.srv.br/api/mhnet/1';
const EASY_TOKEN = process.env.EASY_TOKEN;
const ENABLE_TENTOU_OUTRO_DOC_FLAG =
  String(process.env.ENABLE_TENTOU_OUTRO_DOC_FLAG || 'true') === 'true';

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify(body)
  };
}

async function easyRequest(path, options = {}) {
  if (!EASY_TOKEN) {
    throw new Error('EASY_TOKEN não configurado.');
  }

  const response = await fetch(`${EASY_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${EASY_TOKEN}`,
      'Content-Type': 'application/json',
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
      data?.message || data?.error || `Falha no Easy (${response.status})`;
    const err = new Error(message);
    err.statusCode = response.status;
    err.payload = data;
    throw err;
  }

  return data;
}

async function updateClient(updatePayload) {
  return easyRequest('/cliente/editar', {
    method: 'POST',
    body: JSON.stringify(updatePayload)
  });
}

async function markTentouOutroDoc(documentoCliente) {
  return easyRequest('/tentouOutroDoc/editar', {
    method: 'POST',
    body: JSON.stringify({
      documentoCliente
    })
  });
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

    const response = await updateClient(preview.updatePayload);

    let tentouOutroDocResponse = null;
    if (ENABLE_TENTOU_OUTRO_DOC_FLAG) {
      tentouOutroDocResponse = await markTentouOutroDoc(
        preview.documentoAtual
      );
    }

    return json(200, {
      ok: true,
      message: 'Cliente atualizado com sucesso no Easy.',
      sentPayload: preview.updatePayload,
      easyResponse: response,
      tentouOutroDocFlag: tentouOutroDocResponse,
      audit: {
        confirmedAt: new Date().toISOString(),
        documentoAtual: preview.documentoAtual,
        updateMode: preview.updateMode
      }
    });
  } catch (error) {
    return json(error.statusCode || 500, {
      error: error.message || 'Erro interno ao confirmar atualização.',
      details: error.payload || null
    });
  }
};
