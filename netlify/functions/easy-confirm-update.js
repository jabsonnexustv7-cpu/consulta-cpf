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

function sanitizeDocumento(value) {
  return String(value || '').trim();
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
  const payload = {
    documentoCliente: sanitizeDocumento(documentoCliente)
  };

  console.log('[tentouOutroDoc] payload enviado:', payload);

  const response = await easyRequest('/tentouOutroDoc/editar', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  console.log('[tentouOutroDoc] resposta recebida:', response);

  if (response?.success === false) {
    const err = new Error(
      response?.message || 'Falha ao marcar tentouOutroDoc no Easy.'
    );
    err.payload = response;
    throw err;
  }

  return {
    payloadSent: payload,
    response
  };
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

    const documentoAtual = sanitizeDocumento(preview?.documentoAtual);
    const documentoDoPayload = sanitizeDocumento(
      preview?.updatePayload?.documentoCliente
    );

    console.log('[preview] documentoAtual:', documentoAtual);
    console.log('[preview] documentoDoPayload:', documentoDoPayload);
    console.log('[preview] updateMode:', preview?.updateMode);
    console.log('[preview] updatePayload:', preview?.updatePayload);

    let tentouOutroDocFlag = null;

    if (ENABLE_TENTOU_OUTRO_DOC_FLAG) {
      const documentoParaFlag = documentoAtual || documentoDoPayload;

      if (!documentoParaFlag) {
        throw new Error(
          'Não foi possível identificar o documento para marcar tentouOutroDoc.'
        );
      }

      tentouOutroDocFlag = await markTentouOutroDoc(documentoParaFlag);
    }

    const easyResponse = await updateClient(preview.updatePayload);

    console.log('[cliente/editar] resposta recebida:', easyResponse);

    return json(200, {
      ok: true,
      message: 'Cliente atualizado com sucesso no Easy.',
      sentPayload: preview.updatePayload,
      easyResponse,
      tentouOutroDocFlag,
      audit: {
        confirmedAt: new Date().toISOString(),
        documentoAtual,
        documentoDoPayload,
        updateMode: preview?.updateMode
      }
    });
  } catch (error) {
    console.error('[confirm-update] erro:', {
      message: error?.message,
      statusCode: error?.statusCode,
      payload: error?.payload || null
    });

    return json(error.statusCode || 500, {
      error: error.message || 'Erro interno ao confirmar atualização.',
      details: error.payload || null
    });
  }
};
