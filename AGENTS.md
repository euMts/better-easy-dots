# AGENTS.md — Better Easy Dots

Instruções para agentes de IA que alteram este repositório.

**Escopo obrigatório:** este projeto é uma extensão **dual — Chrome e Firefox**. Qualquer trabalho (feature, bugfix, UI, CSS, i18n, packaging, testes, changelog, README) deve ser feito pensando nos **dois** navegadores. Entregar só em um browser não é aceitável.

## Regra obrigatória: paridade Chrome + Firefox

Antes de implementar, perguntar: “funciona igual no Chrome **e** no Firefox?”. Se a resposta não for sim, o trabalho não está completo.

Toda mudança deve ser **pensada, implementada e validada** para Chrome **e** Firefox. A extensão deve entregar a mesma UI, os mesmos estilos, os mesmos padrões de interação e as mesmas funcionalidades nos dois navegadores.

- **Default:** tudo é para ambos. Não existe “feature Chrome” ou “feature Firefox” por omissão.
- Não implemente, não mergeie e não considere pronto algo que só funciona / só foi testado em um browser, salvo aprovação explícita do usuário **e** documentação clara da exceção.
- APIs assíncronas do navegador (`storage`, `tabs`, `runtime`, `action`, `windows`) devem passar por `browser-compat.js` / `EEDBrowser`; não espalhe chamadas diretas a `chrome.*` / `browser.*` para esses fluxos.
- Se adicionar arquivo JS/CSS/HTML usado pela extensão, atualize os **quatro** manifests e os scripts de package/dev Firefox quando aplicável.
- Diferenças inevitáveis de plataforma (ex.: `service_worker` vs `background.scripts`, permissão `windows` só no Chrome, match patterns sem porta no Firefox, origins só em `host_permissions` / `content_scripts.matches` — Firefox MV3 rejeita URLs em `permissions`) ficam isoladas nos manifests / packaging — o comportamento do produto continua paritário.
- Sempre valide os **dois** pacotes antes de encerrar (`npm test`; e `npm run lint:firefox` quando a mudança tocar manifest, permissões ou empacotamento Firefox).
- Ao testar manualmente: recarregar no Chrome **e** no Firefox (`load-in-firefox/` via `npm run firefox:dev` — nunca o root do repo no Firefox).

## Regra obrigatória: versão + changelog

**Uma versão nova por sessão de desenvolvimento / commit** — não por cada feature implementada no meio do trabalho.

Durante a sessão, acumule features e correções sob a **mesma** versão. Só defina o bump e a entrada de changelog quando for fechar a entrega (o commit da sessão). Se a sessão ainda estiver aberta e a versão já foi aberta no changelog, **adicione itens na entrada existente** em vez de criar `1.x+1`.

Não deixe para depois. Não abra versão nova sem itens de changelog. Não adicione texto só em um idioma.

### Quando bumpar a versão

Use [Semantic Versioning](https://semver.org/) no `manifest.json`:

| Tipo de mudança | Exemplo | Bump |
|-----------------|---------|------|
| Correção de bug, ajuste visual pequeno, refactor sem impacto visível | fix saldo, tooltip errado | **patch** `1.1.0` → `1.1.1` |
| Nova funcionalidade, melhoria perceptível, novo fluxo na UI | changelog, planejador, i18n | **minor** `1.1.0` → `1.2.0` |
| Quebra de compatibilidade ou mudança estrutural grande | remoção de config, novo manifest | **major** `1.1.0` → `2.0.0` |

Refactors internos, comentários, docs sem mudança de produto: **não** bumpam versão.

Se várias features da mesma sessão ainda não foram publicadas na loja e acabaram em versões intermediárias por engano, **consolide numa única entrada** (a versão atual do manifest) antes de publicar — não deixe várias entradas “Novo” que na prática são a mesma entrega.

---

## Checklist (sempre nesta ordem)

1. **Definir a versão da sessão** (ex.: `1.2.0`) — uma vez por entrega/commit, não por implementação.
2. **Atualizar manifests** — mesma versão nos **quatro**:
   - `manifest.json` (Chrome, dev)
   - `manifest.prod.json` (Chrome, loja)
   - `manifest.firefox.json` (Firefox, dev)
   - `manifest.firefox.prod.json` (Firefox, AMO)
3. **Adicionar ou estender a entrada no topo do changelog** em `changelog.js`:
   - Array `EED_CHANGELOG_ENTRIES`: entrada da sessão **primeira** (mais recente no topo).
   - Inclua `date: 'YYYY-MM-DD'` (data da entrega).
   - Cada item é uma **chave i18n**, nunca texto solto.
   - Se a entrada da sessão já existe, só acrescente itens — não crie outra versão.
4. **Traduzir itens em ambos os locales**:
   - `_locales/pt_BR/messages.json`
   - `_locales/en/messages.json`
5. **Atualizar fallback de versão** em `changelog.js` (`eedGetCurrentVersion`).
6. **Atualizar READMEs**:
   - `README.md` — badge e linha “Versão atual”
   - `README.en.md` — badge e “Current version”
7. **Validar** antes de encerrar:

```bash
npm run validate:json
npm test
```

Popup e settings leem a versão de `EEDBrowser.runtime.getManifest().version` — **não** hardcodar versão em `popup.js` / `settings-page.js` (usar só fallback no `catch` se existir).

### Chrome + Firefox

- Entrega sempre é **par**: mesmo código de produto, mesma semver, mesmos itens de changelog.
- **Uma semver** para ambos os browsers (os quatro manifests com a mesma `version`).
- Gecko ID fixo: `better-easy-dots@matheuspass.dev` (não mudar após a 1ª publicação AMO).
- Packaging: `npm run package` → `builds/better-easy-dots-chrome-vX.Y.Z.zip` + `builds/better-easy-dots-firefox-vX.Y.Z.zip`.
- `EED_CHANGELOG_LAST_SHIPPED_VERSION`: atualize quando a versão estiver ao vivo **nas duas lojas** (CWS + AMO). **Não** use essa constante para o badge visual “Novo”/“New”.
- Refactors só de packaging/CI **sem** mudança de produto: não bumpam versão.

---

## Changelog e badge “novo/new”

Sempre que uma nova versão for adicionada ao changelog:

- A versão mais recente deve ficar no topo de `EED_CHANGELOG_ENTRIES` (a renderização também ordena por semver decrescente: `1.10.0` > `1.9.9`).
- **Apenas a versão mais recente** pode exibir a label **novo** (PT) / **new** (EN).
- Versões anteriores **nunca** devem manter a label “novo”/“new”.
- A label “novo”/“new” significa **última versão listada no changelog**, não “não lida pelo usuário”.
- Não usar `localStorage`, `chrome.storage` / `EEDBrowser.storage` ou estado por usuário para decidir essa label.
- `eedLastSeenChangelogVersion` controla **somente** a abertura automática da página de novidades — não o badge.
- Se um dia for preciso indicar versões não lidas, criar **outro** estado/texto separado. Não reutilizar o badge “novo”/“new”.
- A renderização deve usar lógica automática (`index === 0` via `eedShouldShowChangelogNewBadge`). Não marcar várias entradas com `isNew: true`.
- Ao atualizar versão em manifest/package/changelog, conferir que **somente** a última entrada aparece como nova.

## Atualização de versão

Quando a tarefa exigir bump de versão:

- Atualizar os quatro manifests (Chrome/Firefox, dev/prod).
- Atualizar `package.json` e lockfile, se aplicável.
- Atualizar changelog PT/EN (entrada no topo, ou itens na entrada da sessão).
- Garantir que somente a entrada mais recente do changelog tenha badge “novo”/“new”.
- Não deixar versões antigas marcadas como novas.
- Não abrir uma versão nova no meio da sessão para cada feature — acumule na versão da entrega.

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
- `changelogView`, `changelogUpdatedSubtitle`, `changelogUpdatedOn`
- `changelogRateInStore`, `changelogOpenSettings`, `changelogClose`

---

## Exemplo: adicionar v1.2.0

### 1. `changelog.js`

```javascript
const EED_CHANGELOG_ENTRIES = [
  {
    version: '1.2.0',
    date: '2026-08-11',
    items: [
      'changelogV120Item1',
      'changelogV120Item2',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-07-10',
    items: [ /* … */ ],
  },
  // versões antigas abaixo, sem remover histórico
];
```

Atualizar fallback:

```javascript
return EEDBrowser.runtime?.getManifest?.()?.version || '1.2.0';
```

- A **primeira** entrada do changelog (versão mais recente, após ordenação semver) recebe o badge **Novo** / **New**. As demais **nunca** recebem esse badge.
- `eedLastSeenChangelogVersion` controla só a abertura automática do changelog — não a label “novo”/“new”.
- Após publicar **nas duas lojas** (Chrome Web Store + AMO), atualize `EED_CHANGELOG_LAST_SHIPPED_VERSION` para a versão publicada (marcador interno de loja, não do badge).
- A linha auxiliar da página usa `changelogUpdatedOn` com a `date` da entrada mais recente (não “Versão X · Veja o que mudou”).

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

em `manifest.json`, `manifest.prod.json`, `manifest.firefox.json` e `manifest.firefox.prod.json`.

---

## Comportamento do changelog (não quebrar)

- Página dedicada: `changelog.html` (aba do navegador), **não** modal no popup.
- Abertura automática: `background.js` → `EEDBrowser.runtime.onInstalled` (`install` + `update`).
- Persistência: `eedLastSeenChangelogVersion` no storage local via `EEDBrowser.storage.local`; marcada ao carregar `changelog.html`.
- **Não** colocar lógica de changelog em `content.js` nem no DOM do Easydots.

---

## O que não fazer

- Implementar, validar ou “fechar” trabalho só no Chrome ou só no Firefox.
- Assumir que “funcionou no Chrome” = pronto (o mesmo vale para Firefox).
- Texto de changelog hardcoded em `changelog.js`, `changelog.html` ou CSS.
- Só PT ou só EN.
- Bump de versão no manifest sem entrada em `EED_CHANGELOG_ENTRIES`.
- Abrir versão nova no meio da sessão para cada feature — acumule na versão da entrega.
- Remover versões antigas do histórico (só adicionar no topo; consolidar só entradas ainda não publicadas na loja).
- Abrir changelog dentro do popup.
- Marcar mais de uma versão com badge “novo”/“new”, ou decidir esse badge por `EED_CHANGELOG_LAST_SHIPPED_VERSION` / storage.
- Commitar sem validar que `_locales/en/messages.json` e `_locales/pt_BR/messages.json` são JSON válidos.
- Bumpar só manifests Chrome e esquecer os Firefox (os quatro devem bater).
- Carregar a extensão temporária no Firefox a partir da raiz do repo (use `load-in-firefox/`).

---

## Validação rápida

```bash
npm run validate:json
npm test
```

Ou manualmente:

```bash
node -e "
JSON.parse(require('fs').readFileSync('_locales/en/messages.json'));
JSON.parse(require('fs').readFileSync('_locales/pt_BR/messages.json'));
JSON.parse(require('fs').readFileSync('manifest.json'));
JSON.parse(require('fs').readFileSync('manifest.prod.json'));
JSON.parse(require('fs').readFileSync('manifest.firefox.json'));
JSON.parse(require('fs').readFileSync('manifest.firefox.prod.json'));
console.log('OK');
"
```

Após recarregar a extensão em `chrome://extensions` (e no Firefox via `about:debugging`), conferir:

- `changelog.html` mostra a versão mais recente com badge Novo/New **somente nessa entrada** (nenhuma versão anterior com a label)
- a linha auxiliar mostra a data de atualização (não “Versão X · Veja o que mudou”)
- `settings.html` e popup exibem `v<versão-do-manifest>`
- README badges batem com o manifest

Para testar abertura automática de novo:

```js
chrome.storage.local.remove('eedLastSeenChangelogVersion')
```
