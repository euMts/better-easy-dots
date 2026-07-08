# Better Easy Dots — To-do para publicação

Checklist do que **ainda falta** antes de publicar na Chrome Web Store.

**Empacotar:** `./package.sh` → `better-easy-dots.zip` (v1.0.0, `manifest.prod.json`, sem localhost)

**Loja (rascunho):** [Better Easy Dots](https://chromewebstore.google.com/detail/better-easy-dots/cfnehkkbmplomaianjpfiaoonmpekbbb) · ID `cfnehkkbmplomaianjpfiaoonmpekbbb`

---

## Chrome Web Store

- [ ] Testar links (rascunho pode retornar 404 para não-desenvolvedores):
  - Botão **Avaliar na loja** no popup
  - Link **by better easy dots** no saldo do dia
- [ ] Preencher/atualizar o listing no painel:
  - **Descrição curta** — usar `_locales/*/messages.json` → `extensionDescription`
  - **Descrição longa** — funcionalidades, `*.easydots.com.br` / `*.acspontodigital.com.br`, dados locais (`chrome.storage.local`)
  - **Categoria:** Produtividade (ou Ferramentas)
  - **Idioma principal:** Português (Brasil)
- [ ] Upload de imagens:
  - Ícone 128×128 (`icons/android-chrome-512x512.png` ou `icons/128x128.png`)
  - Screenshots em `screenshots/pt/` e `screenshots/en/` (mín. 1 por idioma)
- [ ] Publicar política de privacidade (URL externa) e informar no painel — base: seção Privacidade do `README.md`
- [ ] Justificativa de permissões para o revisor:
  - `storage` — horários e URL do Easydots salvos localmente
  - `*.easydots.com.br` / `*.acspontodigital.com.br` — injetar melhorias na página aberta pelo usuário
- [ ] Enviar rascunho para revisão

---

## Testes antes de publicar

- [ ] Instalar o `.zip` empacotado em `chrome://extensions` (não só “recarregar” no modo dev)
- [ ] Confirmar que o pacote **não** inclui `website/`, `docs/`, `.git/`, `.crx`, `.pem`
- [ ] Testar em pelo menos **2 subdomínios** (ex.: `sys.easydots.com.br` e o da sua empresa)
- [ ] Primeira visita: URL do Easydots detectada automaticamente
- [ ] Configurações: validação de erros, salvar, recarregar página → UI atualiza
- [ ] Tabela: cores, coluna **Diferença**, tooltips, hover, saldo do dia, sugestões de batidas
- [ ] Menu lateral e popup → **Configurações** abrem `settings.html`
- [ ] Badge no ícone com aba do Easydots aberta
- [ ] Extensão funciona sem aba `127.0.0.1` aberta

---

## Pós-publicação

- [ ] Links da Chrome Web Store abrem a página pública da extensão
- [ ] Tag git `v1.0.0` alinhada ao `manifest.json`
- [ ] Changelog breve da release

---

## Riscos conhecidos

| Seletor | Uso |
|---------|-----|
| `#table_registro_horario` | Tabela, Diferença, saldo, sugestões, tooltips |
| `#sidebar-menu > ul` / `#eed-sidebar-settings` | Configurações no menu lateral |
| `#btnRegister` | Registrar horário |
| `.clock` | Relógio da página |
| `#deviceType` | Container do botão de registro |
| `#inputHorario` | Importação de jornada |

- [ ] Revalidar após updates do Easydots
- [ ] Monitorar performance do `MutationObserver` em `document.body`

---

## Opcional (pós-v1)

- [ ] Popup com resumo do dia (saldo, última batida)
- [ ] Botão para abrir/focar aba do Easydots
- [ ] Testes unitários (`settings.js`, saldo/diferença em `content.js`)
- [ ] Fallback/log em `content.js` quando seletor não existir
