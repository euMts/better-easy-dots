# Better Easy Dots — To-do para produção

Checklist para levar a extensão de **quase pronta** a **publicável na Chrome Web Store**.

---

## Já concluído

- Versão beta `0.1.0` no `manifest.json`
- `README.md` + `README.en.md` (com badges de idioma)
- Licença MIT (`LICENSE`)
- Seletores do DOM documentados (abaixo) e centralizados em `content.js` → `SELECTORS`
- Espelho local `website/` para dev (HTML corrigido, seletores preservados, favicon, ícones offline, `mirror-dev.js` sem chamadas externas, loading máx. 2s)
- Animações Easydots na extensão (`eed-animations.css`, ripple via `eed-waves.js` no popup/configurações)
- `website/` no `.gitignore`

---

## Bloqueadores (fazer antes de publicar)

### 1. ID da Chrome Web Store

- [ ] Criar conta de desenvolvedor na [Chrome Web Store](https://chrome.google.com/webstore/devconsole) (taxa única de US$ 5)
- [ ] Fazer upload do primeiro rascunho da extensão (`.zip` sem pasta `website/`)
- [ ] Copiar o ID real da extensão após a publicação (ou do rascunho na URL `.../detail/.../XXXXXXXX`)
- [ ] Atualizar `config.js`:

  ```js
  const EED_EXTENSION_URL = 'https://chromewebstore.google.com/detail/better-easy-dots/SEU_ID_REAL';
  ```

- [ ] Testar os links:
  - Botão **Avaliar na loja** no popup
  - Link **by better easy dots** no saldo do dia

---

### 2. Manifest de produção (remover ambiente de dev)

Remover todas as referências a `http://127.0.0.1:5500` antes de gerar o `.zip` para a loja.

**`manifest.json`**

- [ ] Remover `http://127.0.0.1:5500/*` de `host_permissions`
- [ ] Remover `http://127.0.0.1:5500/website/*` de `content_scripts[].matches`
- [ ] Remover `http://127.0.0.1:5500/*` de `web_accessible_resources[].matches`

**Código (opcional; manter em branch `dev` se quiser espelho local)**

- [ ] `settings.js` — remover checagens de `127.0.0.1:5500`
- [ ] `background.js` — remover checagens de `127.0.0.1:5500`

**Sugestão:** `manifest.dev.json` na branch `dev` com localhost; `manifest.json` limpo na release.

---

### 3. Materiais da Chrome Web Store

**Textos** (rascunhos no `README.md`; copiar/adaptar no painel da loja)

- [ ] **Nome:** Better Easy Dots
- [ ] **Descrição curta** (máx. 132 caracteres)
- [ ] **Descrição longa** (funcionalidades, `*.acspontodigital.com.br`, dados locais, aviso não oficial)
- [ ] **Categoria:** Produtividade (ou Ferramentas)
- [ ] **Idioma principal:** Português (Brasil)

**Imagens**

- [ ] Ícone da loja: 128×128 (`icons/android-chrome-512x512.png` redimensionado)
- [ ] Screenshots (mín. 1, recomendado 3–5): tabela com cores, saldo do dia, sugestões, configurações (1280×800 ou 640×400)

**Privacidade**

- [ ] Publicar política de privacidade (GitHub Pages, etc.) — conteúdo mínimo no `README.md` (seção Privacidade) serve de base
- [ ] Informar a URL da política no painel da Chrome Web Store

**Justificativa de permissões (para o revisor)**

- [ ] `storage` — salvar horários e URL do Easydots localmente
- [ ] `tabs` — localizar aba aberta do Easydots para atualizar o badge
- [ ] `host_permissions` em `*.acspontodigital.com.br` — injetar melhorias na página aberta pelo usuário

---

### 4. Empacotamento para upload

- [ ] Gerar `.zip` **somente** com os arquivos da extensão:

  ```
  manifest.json
  background.js
  config.js
  settings.js
  settings-ui.js
  settings-ui.css
  settings.html
  settings-page.js
  settings-page.css
  content.js
  content.css
  eed-animations.css
  eed-waves.js
  popup.html
  popup.js
  popup.css
  icons/
  LICENSE
  ```

- [ ] **Não incluir:** `website/`, `docs/`, `.git/`, `.crx`, `.pem`, `node_modules/`
- [ ] Testar o pacote em `chrome://extensions` antes de enviar à loja

```bash
zip -r better-easy-dots.zip \
  manifest.json background.js config.js settings.js settings-ui.js settings-ui.css \
  settings.html settings-page.js settings-page.css \
  content.js content.css eed-animations.css eed-waves.js \
  popup.html popup.js popup.css icons/ LICENSE \
  -x "*.DS_Store"
```

---

## Testes manuais obrigatórios

### 5. Validar em ambiente real

- [ ] Testar em pelo menos **2 subdomínios** diferentes (ex.: `sys.` e o da sua empresa)
- [ ] Primeira visita: URL do Easydots detectada automaticamente (sem forçar `/site/login`)
- [ ] Salvar configurações com campos inválidos → erros no formulário
- [ ] Salvar configurações válidas → saldo e cores funcionam
- [ ] Dia incompleto → saldo negativo correto; sugestões de batidas aparecem
- [ ] Dia completo (2 entradas + 2 saídas com intervalo) → saldo com pontualidade
- [ ] Gear na navbar e botões de configurações abrem `settings.html`
- [ ] Badge no ícone mostra quantidade de registros com aba do Easydots aberta
- [ ] Recarregar página do Easydots após mudar configs → UI atualiza
- [ ] *(Opcional, dev)* Validar no espelho `http://127.0.0.1:5500/website/` — sem requisições externas no Network

### 6. Testar fluxo pós-publicação

- [ ] Instalar a versão empacotada (não só “recarregar” no modo dev)
- [ ] Links da Chrome Web Store abrem a página correta da extensão
- [ ] Extensão funciona sem nenhuma aba `127.0.0.1` aberta

---

## Riscos conhecidos (mitigar quando possível)

### 7. Acoplamento ao DOM do Easydots

| Seletor | Uso |
|---------|-----|
| `#table_registro_horario` | Tabela de registros, saldo, sugestões |
| `#btnRegister` | Botão de registrar horário |
| `ul.navbar-nav.navbar-right.pull-right` | Gear na navbar |
| `.clock` | Relógio da página |
| `#deviceType` | Container do botão de registro |

- [ ] Após qualquer update do Easydots, revalidar o item 5
- [ ] *(Futuro)* Fallback/log em `content.js` quando seletor não existir

### 8. `MutationObserver` no `document.body`

- [ ] Monitorar performance em páginas pesadas; se houver lentidão, restringir o observer à tabela/navbar

---

## Melhorias opcionais (pós-v1)

### 9. Popup mais útil

- [ ] Resumo do dia no popup (saldo, última batida, horários configurados ou não)
- [ ] Botão para abrir/focar aba do Easydots

### 10. Testes automatizados

- [ ] Testes unitários para `settings.js` (URL, validação de horários)
- [ ] Testes unitários para saldo em `content.js`
- [ ] *(Avançado)* E2E com espelho `website/` (só em dev)

### 11. CI / release

- [ ] Script `package.sh` que gera `better-easy-dots.zip` (produção, sem localhost)
- [ ] Tag de versão alinhada ao `manifest.json`
- [ ] Changelog breve por release

---

## Ordem sugerida de execução

1. Manifest de produção + empacotamento (itens 2 e 4)
2. Testes manuais (itens 5 e 6)
3. Rascunho na Chrome Web Store + materiais (item 3)
4. Atualizar `EED_EXTENSION_URL` (item 1)
5. Publicar e validar links (itens 1 e 6)
6. Mitigações e melhorias (itens 7–11) conforme prioridade

---

## Critério de “production-ready”

| Cenário | Critério |
|---------|----------|
| **Uso pessoal / sideload** | Itens 2, 4, 5 e 6 concluídos |
| **Chrome Web Store** | Itens 1–6 concluídos + política de privacidade + listing completo |
