const {
  onlyDigits,
  buildUpdatePayload,
  signPreviewToken
} = require('./easy-shared');

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return json(405, { error: 'Método não permitido.' });
    }

    const body = JSON.parse(event.body || '{}');
    const documentoAtual = onlyDigits(body?.documentoAtual);
    const updateMode =
      body?.updateMode === 'dados_documento' ? 'dados_documento' : 'dados';
    const consulta = body?.consulta || {};

    if (!documentoAtual || documentoAtual.length !== 11) {
      return json(400, { error: 'Documento atual inválido.' });
    }

    if (!consulta?.nomeCompleto) {
      return json(400, { error: 'Nome retornado da consulta é obrigatório.' });
    }

    if (!consulta?.dataDeNascimento) {
      return json(400, {
        error: 'Data de nascimento retornada da consulta é obrigatória.'
      });
    }

    if (updateMode === 'dados_documento') {
      const documentoNovo = onlyDigits(consulta?.documentoNovo);
      if (!documentoNovo || documentoNovo.length !== 11) {
        return json(400, { error: 'Documento novo inválido.' });
      }
    }

    const updatePayload = buildUpdatePayload(
      documentoAtual,
      {
        nomeCompleto: consulta.nomeCompleto,
        dataDeNascimento: consulta.dataDeNascimento,
        documentoNovo: consulta.documentoNovo
      },
      updateMode
    );

    const previewToken = signPreviewToken({
      iat: Date.now(),
      exp: Date.now() + 10 * 60 * 1000,
      documentoAtual,
      updateMode,
      updatePayload
    });

    const changes = [
      {
        field: 'name',
        currentValue: '(não consultado no Easy)',
        newValue: updatePayload.nome,
        changed: true
      },
      {
        field: 'dataNascimento',
        currentValue: '(não consultado no Easy)',
        newValue: updatePayload.dataNascimento,
        changed: true
      }
    ];

    if (updateMode === 'dados_documento') {
      changes.push({
        field: 'documentoNovo',
        currentValue: documentoAtual,
        newValue: updatePayload.documentoNovo,
        changed: documentoAtual !== updatePayload.documentoNovo
      });
    }

    return json(200, {
      ok: true,
      lookupMode: 'sem-leitura-do-easy',
      message: 'Preview gerado sem leitura prévia do cadastro no Easy.',
      currentClient: {
        documentoCliente: documentoAtual
      },
      updatePayload,
      changes,
      previewToken
    });
  } catch (error) {
    return json(error.statusCode || 500, {
      error: error.message || 'Erro interno ao gerar preview.',
      details: error.payload || null
    });
  }
};
