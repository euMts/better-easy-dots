# RELEASE_CHECKLIST — Better Easy Dots

Checklist de publicação na **Chrome Web Store** e no **Firefox Add-ons (AMO)**. Use antes de cada reenvio.

## 0. Causa conhecida da rejeição Yellow Magnesium (v1.7.0)

O ZIP de `1.7.0` gerado pelo `package.sh` antigo **omitia** `pending-requests-impact.js`, arquivo listado em `content_scripts` e responsável por chamar `init()`.

Resultado: a extensão instalava, mas **não ativava** as melhorias no Easydots → rejeição “Functionality not working / Não oferecer a funcionalidade prometida”.

Sempre rode `npm run package` (valida + empacota ambos). Não envie ZIP feito à mão.

---

## 1. Gerar pacotes de produção

```bash
npm install
npm run package
```

Confirme no terminal:

- validação passou (`Pacote válido.`) para **chrome** e **firefox**
- ZIPs:
  - `builds/better-easy-dots-chrome-vX.Y.Z.zip`
  - `builds/better-easy-dots-firefox-vX.Y.Z.zip`
- `pending-requests-impact.js` na lista de arquivos
- `manifest.json` na raiz de cada ZIP (não dentro de `dist/` nem `better-easy-dots/`)

Opcional Firefox:

```bash
npm run lint:firefox
```

---

## 2. Extrair o ZIP Chrome em pasta limpa

```bash
VERSION=$(node -p "require('./manifest.prod.json').version")
rm -rf /tmp/eed-store-test-chrome
mkdir -p /tmp/eed-store-test-chrome
unzip -q "builds/better-easy-dots-chrome-v${VERSION}.zip" -d /tmp/eed-store-test-chrome
ls /tmp/eed-store-test-chrome/manifest.json
```

---

## 3–6. Carregar no Chrome

1. Abra `chrome://extensions`
2. Ative **Modo do desenvolvedor**
3. Clique em **Carregar sem compactação**
4. Selecione a pasta extraída (`/tmp/eed-store-test-chrome`) ou `dist/chrome` após o package
5. Confirme que o card da extensão **não** mostra erro (ícone vermelho / “Service worker registration failed” / content script missing)

---

## 7–9. Testar no Easydots (Chrome)

Abra `https://sys.easydots.com.br/` (logado) e verifique:

- [ ] Registros do Dia melhorados (cores / sugestões)
- [ ] Saldo do dia
- [ ] Banco de horas (card)
- [ ] Simulador de jornada
- [ ] Banco com pendentes / impacto na página de solicitações (se aplicável)
- [ ] Página de solicitações com resumo de impacto (se houver pendentes)
- [ ] Engrenagem Better Easy Dots na sidebar
- [ ] Popup com status **Ativo nesta página do Easydots.**

## 10. Página fora do Easydots

1. Abra `https://www.google.com` (ou qualquer site)
2. Clique no ícone da extensão
3. Deve aparecer o aviso de site errado
4. A página visitada não deve quebrar / console sem erros da extensão

## 11. Domínio certo, sem login / página incompleta

1. Abra o domínio Easydots em tela de login ou página sem tabela de registros
2. Popup deve mostrar aguardando carregamento/login
3. Não deve parecer “extensão vazia/quebrada”

## 12. Console

No Easydots logado, DevTools → Console:

- [ ] Sem erros críticos da extensão
- [ ] Idealmente: `[Better Easy Dots] pending-requests-impact ativo`

---

## Firefox — carregar e smoke test

```bash
VERSION=$(node -p "require('./manifest.firefox.prod.json').version")
rm -rf /tmp/eed-store-test-firefox
mkdir -p /tmp/eed-store-test-firefox
unzip -q "builds/better-easy-dots-firefox-v${VERSION}.zip" -d /tmp/eed-store-test-firefox
```

1. Abra `about:debugging#/runtime/this-firefox`
2. **Carregar complemento temporário…**
3. Selecione `/tmp/eed-store-test-firefox/manifest.json` (ou `dist/firefox/manifest.json`)
4. Confirme que não há erros de background / content scripts
5. Repita os smoke tests 7–12 no Firefox (mesmas checagens no Easydots)

Detalhes: [`docs/firefox.md`](docs/firefox.md).

---

## 13. Descrição das lojas

Cole na listagem **apenas** o que a versão enviada entrega. Texto sugerido (PT):

> Melhora o registro de ponto no Easydots (sys.easydots.com.br): saldo do dia, cores por tolerância, sugestões de batida, banco de horas, simulador de jornada e impacto estimado de solicitações pendentes. Configurações locais no navegador — sem enviar seus dados a servidores da extensão.
>
> Como usar: instale, abra o Easydots da sua empresa, configure os horários na engrenagem Better Easy Dots e veja as melhorias na tabela de registros.

English (short):

> Improves the Easydots time clock: daily balance, tolerance colors, punch suggestions, hour bank, schedule simulator, and estimated impact of pending requests. Settings stay in your browser.
>
> Open your company Easydots page after installing to use the features.

**Não prometer:**

- funcionalidades futuras
- páginas ainda não suportadas
- integrações que não aparecem no ZIP
- qualquer coisa que só exista nos manifests de desenvolvimento (localhost)

---

## 14. Enviar os ZIPs

| Loja | Arquivo |
|------|---------|
| Chrome Web Store | `builds/better-easy-dots-chrome-vX.Y.Z.zip` |
| Firefox Add-ons (AMO) | `builds/better-easy-dots-firefox-vX.Y.Z.zip` |

Não recompacte a pasta do repositório inteira (isso inclui `website/`, `docs/`, etc. e pode aninhar pastas).

### GitHub Release (opcional)

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

O workflow `.github/workflows/release.yml` anexa os dois ZIPs ao release.

---

## Comandos úteis

```bash
npm run validate:json       # JSON dos locales + 4 manifests
npm run package             # dist/chrome + dist/firefox + ZIPs
npm run package:chrome
npm run package:firefox
npm run validate:chrome     # valida dist/chrome
npm run validate:firefox    # valida dist/firefox
npm run lint:firefox        # web-ext lint no pacote Firefox
npm test                    # validate:json + package
```

Após publicar **nas duas lojas** com sucesso, atualize `EED_CHANGELOG_LAST_SHIPPED_VERSION` em `changelog.js`. Se só uma loja estiver ao vivo, espere a outra (ou documente o atraso) antes de avançar o shipped marker.
