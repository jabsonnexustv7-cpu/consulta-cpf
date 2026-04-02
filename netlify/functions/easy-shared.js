const crypto = require('crypto');

function onlyDigits(value) {
  return String(value || '').replace(/\D+/g, '');
}

function formatCpf(value) {
  const digits = onlyDigits(value);
  if (digits.length !== 11) return digits;
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function formatDateToBr(value) {
  if (!value) return '';

  const s = String(value).trim();

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    return s;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [yyyy, mm, dd] = s.split('-');
    return `${dd}/${mm}/${yyyy}`;
  }

  return s;
}

function buildUpdatePayload(documentoAtual, incoming, updateMode) {
  const payload = {
    documentoCliente: formatCpf(documentoAtual),
    nome: incoming?.nomeCompleto || '',
    dataNascimento: formatDateToBr(incoming?.dataDeNascimento || '')
  };

  if (updateMode === 'dados_documento') {
    payload.documentoNovo = formatCpf(incoming?.documentoNovo || '');
  }

  return payload;
}

function signPreviewToken(payload) {
  const secret = process.env.PREVIEW_TOKEN_SECRET;
  if (!secret) throw new Error('PREVIEW_TOKEN_SECRET não configurado.');

  const json = JSON.stringify(payload);
  const base64 = Buffer.from(json, 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(base64)
    .digest('base64url');

  return `${base64}.${signature}`;
}

function verifyPreviewToken(token) {
  const secret = process.env.PREVIEW_TOKEN_SECRET;
  if (!secret) throw new Error('PREVIEW_TOKEN_SECRET não configurado.');

  const [base64, signature] = String(token || '').split('.');
  if (!base64 || !signature) throw new Error('Preview token inválido.');

  const expected = crypto
    .createHmac('sha256', secret)
    .update(base64)
    .digest('base64url');

  if (signature !== expected) {
    throw new Error('Assinatura do preview token inválida.');
  }

  const json = Buffer.from(base64, 'base64url').toString('utf8');
  return JSON.parse(json);
}

module.exports = {
  onlyDigits,
  formatCpf,
  formatDateToBr,
  buildUpdatePayload,
  signPreviewToken,
  verifyPreviewToken
};
