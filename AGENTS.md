# AGENTS.md — Better Easy Dots

Instruções para agentes de IA que alteram este repositório.

## Regra obrigatória: versão + changelog

**A cada entrega que inclua feature relevante ou correção de bug visível ao usuário**, atualize a versão e o changelog **nas duas línguas** (PT e EN) no mesmo PR/commit da mudança.

Não deixe para depois. Não abra versão nova sem itens de changelog. Não adicione texto só em um idioma.

### Quando bumpar a versão

Use [Semantic Versioning](https://semver.org/) no `manifest.json`:

| Tipo de mudança | Exemplo | Bump |
|-----------------|---------|------|
| Correção de bug, ajuste visual pequeno, refactor sem impacto visível | fix saldo, tooltip errado | **patch** `1.1.0` → `1.1.1` |
| Nova funcionalidade, melhoria perceptível, novo fluxo na UI | changelog, planejador, i18n | **minor** `1.1.0` → `1.2.0` |
| Quebra de compatibilidade ou mudança estrutural grande | remoção de config, novo manifest | **major** `1.1.0` → `2.0.0` |

Refactors internos, comentários, docs sem mudança de produto: **não** bumpam versão.

---

## Checklist (sempre nesta ordem)

1. **Definir a nova versão** (ex.: `1.2.0`).
2. **Atualizar manifests** — mesma versão nos dois:
   - `manifest.json`
   - `manifest.prod.json`
3. **Adicionar entrada no topo do changelog** em `changelog.js`:
   - Array `EED_CHANGELOG_ENTRIES`: nova entrada **primeira** (mais recente no topo).
   - Cada item é uma **chave i18n**, nunca texto solto.
4. **Traduzir itens em ambos os locales**:
   - `_locales/pt_BR/messages.json`
   - `_locales/en/messages.json`
5. **Atualizar fallback de versão** em `changelog.js` (`eedGetCurrentVersion`).
6. **Atualizar READMEs**:
   - `README.md` — badge e linha “Versão atual”
   - `README.en.md` — badge e “Current version”
7. **Conferir** `docs/to-do.md` se mencionar versão de empacote/tag.
8. **Validar JSON** dos dois `messages.json` antes de encerrar.

Popup e settings leem a versão de `chrome.runtime.getManifest().version` — **não** hardcodar versão em `popup.js` / `settings-page.js` (usar só fallback no `catch` se existir).

---

## Convenção de chaves i18n do changelog

Padrão para itens de versão `X.Y.Z`:

```
changelogV<major><minor><patch>Item<N>
```

Sem pontos no meio. Exemplos:

| Versão | Chaves |
|--------|--------|
| `1.2.0` | `changelogV120Item1`, `changelogV120Item2`, … |
| `1.1.1` | `changelogV111Item1`, … |
| `0.1.2` | `changelogV012Item1`, … |

Em **cada** `messages.json`, para cada chave:

```json
"changelogV120Item1": {
  "message": "Texto visível ao usuário",
  "description": "Changelog v1.2.0 item"
}
```

- PT em `_locales/pt_BR/messages.json`
- EN em `_locales/en/messages.json`
- Mensagens curtas, em tom de release note (bullet), sem HTML.

Chaves de UI do changelog (já existentes — reutilizar, não duplicar):

- `changelogTitle`, `changelogCurrentVersion`, `changelogNewBadge`
- `changelogView`, `changelogUpdatedSubtitle`, `changelogSeeWhatChanged`
- `changelogRateInStore`, `changelogOpenSettings`, `changelogClose`

---

## Exemplo: adicionar v1.2.0

### 1. `changelog.js`

```javascript
const EED_CHANGELOG_ENTRIES = [
  {
    version: '1.2.0',
    items: [
      'changelogV120Item1',
      'changelogV120Item2',
    ],
  },
  {
    version: '1.1.0',
    items: [ /* … */ ],
  },
  // versões antigas abaixo, sem remover histórico
];
```

Atualizar fallback:

```javascript
return chrome.runtime?.getManifest?.()?.version || '1.2.0';
```

A versão mais recente do array recebe o badge **Novo** / **New** automaticamente na página `changelog.html`.

### 2. `_locales/pt_BR/messages.json`

```json
"changelogV120Item1": {
  "message": "Descrição da feature em português",
  "description": "Item do changelog v1.2.0"
},
"changelogV120Item2": {
  "message": "Outra mudança em português",
  "description": "Item do changelog v1.2.0"
}
```

### 3. `_locales/en/messages.json`

```json
"changelogV120Item1": {
  "message": "Feature description in English",
  "description": "Changelog v1.2.0 item"
},
"changelogV120Item2": {
  "message": "Another change in English",
  "description": "Changelog v1.2.0 item"
}
```

### 4. Manifests

```json
"version": "1.2.0"
```

em `manifest.json` e `manifest.prod.json`.

---

## Comportamento do changelog (não quebrar)

- Página dedicada: `changelog.html` (aba do Chrome), **não** modal no popup.
- Abertura automática: `background.js` → `chrome.runtime.onInstalled` (`install` + `update`).
- Persistência: `eedLastSeenChangelogVersion` em `chrome.storage.local`; marcada ao carregar `changelog.html`.
- **Não** colocar lógica de changelog em `content.js` nem no DOM do Easydots.

---

## O que não fazer

- Texto de changelog hardcoded em `changelog.js`, `changelog.html` ou CSS.
- Só PT ou só EN.
- Bump de versão no manifest sem entrada em `EED_CHANGELOG_ENTRIES`.
- Remover versões antigas do histórico (só adicionar no topo).
- Abrir changelog dentro do popup.
- Commitar sem validar que `_locales/en/messages.json` e `_locales/pt_BR/messages.json` são JSON válidos.

---

## Validação rápida

```bash
node -e "
JSON.parse(require('fs').readFileSync('_locales/en/messages.json'));
JSON.parse(require('fs').readFileSync('_locales/pt_BR/messages.json'));
JSON.parse(require('fs').readFileSync('manifest.json'));
JSON.parse(require('fs').readFileSync('manifest.prod.json'));
console.log('OK');
"
```

Após recarregar a extensão em `chrome://extensions`, conferir:

- `changelog.html` mostra a nova versão com badge Novo/New
- `settings.html` e popup exibem `v<versão-do-manifest>`
- README badges batem com o manifest

Para testar abertura automática de novo:

```js
chrome.storage.local.remove('eedLastSeenChangelogVersion')
```
