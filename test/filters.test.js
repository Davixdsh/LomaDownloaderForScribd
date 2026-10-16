import test from 'node:test';
import assert from 'node:assert/strict';
import { internals } from '../server.js';

test('aceita metadado que declara português do Brasil', () => {
  assert.equal(internals.isBrazilianPortuguese({ language: ['Portuguese'], country: 'Brazil' }), true);
  assert.equal(internals.isBrazilianPortuguese({ language: 'pt-BR' }), true);
  assert.equal(internals.isBrazilianPortuguese({ language: 'Português brasileiro' }), true);
});

test('não presume variante brasileira quando só diz Portuguese/Português', () => {
  assert.equal(internals.isBrazilianPortuguese({ language: 'Portuguese' }), false);
  assert.equal(internals.isBrazilianPortuguese({ language: 'por' }), false);
  assert.equal(internals.isBrazilianPortuguese({ language: 'English', country: 'Brazil' }), false);
});

test('só reconhece PDF e EPUB', () => {
  assert.equal(internals.normalizeFormat('PDF'), 'PDF');
  assert.equal(internals.normalizeFormat('EPUB with images'), 'EPUB');
  assert.equal(internals.normalizeFormat('Microsoft Word'), null);
  assert.deepEqual([...internals.requestedFormats('pdf')], ['PDF']);
  assert.deepEqual([...internals.requestedFormats('all')].sort(), ['EPUB', 'PDF']);
});

test('bloqueia identificadores e caminhos perigosos', () => {
  assert.equal(internals.safeIdentifier('public-item_123'), true);
  assert.equal(internals.safeIdentifier('../private'), false);
  assert.equal(internals.safeFileName('livro pt-br.pdf'), true);
  assert.equal(internals.safeFileName('../../.env'), false);
  assert.equal(internals.safeFileName('livro.docx'), false);
});

test('só lista arquivos PDF/EPUB públicos', () => {
  const files = [
    { name: 'livro.pdf', size: '1234' },
    { name: 'epub/livro.epub', size: '456' },
    { name: 'privado.pdf', private: 'true' },
    { name: 'arquivo.docx', size: '100' },
    { name: '../escape.epub' }
  ];
  const result = internals.getAllowedFiles({ files });
  assert.deepEqual(result.map(file => file.name), ['livro.pdf']);
});
