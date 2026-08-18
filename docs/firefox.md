# Firefox — Better Easy Dots

## Erro: `background.service_worker is currently disabled`

O Firefox, em **Carregar complemento temporário**, **não usa o arquivo que você clicou**.
Ele carrega o **`manifest.json` da pasta** onde esse arquivo está.

Se você escolher qualquer arquivo na **raiz do repo**, o Firefox carrega o `manifest.json` do **Chrome** (`service_worker`) → esse erro.

**Correto:**

```bash
npm run firefox:dev
```

Depois em `about:debugging#/runtime/this-firefox` → **Carregar complemento temporário…** → abra a pasta **`load-in-firefox/`** e selecione o `manifest.json` **dessa pasta** (ou qualquer arquivo dentro dela).

---

## Gecko ID

```
better-easy-dots@matheuspass.dev
```

Definido em `manifest.firefox.json` e `manifest.firefox.prod.json`. Não altere depois da primeira publicação no AMO.

Firefox mínimo: `140.0` (`strict_min_version`). Essa versão já entende a declaração AMO de privacidade em `browser_specific_settings.gecko.data_collection_permissions`.

## Nota: portas no match pattern

O Firefox **não** aceita porta em match patterns (`http://127.0.0.1:5500/*` é ignorado).
Os manifests Firefox usam `http://127.0.0.1/*` / `http://localhost/*`.

## Após carregar

1. Recarregue a aba do Live Server
2. Console da página deve mostrar: `[Better Easy Dots] pending-requests-impact ativo`
3. Se o Firefox pedir permissão de site, permita `127.0.0.1` / `localhost`

## Regra de paridade Chrome + Firefox

Toda mudança de produto deve funcionar nos dois navegadores com a mesma UI, estilos e funcionalidades. Código que usa APIs assíncronas do navegador (`storage`, `tabs`, `runtime`, `action`, `windows`) deve passar por `browser-compat.js`; não chame `chrome.*`/`browser.*` diretamente para esses fluxos.

## Produção / AMO

```bash
npm run package:firefox
```

ZIP: `builds/better-easy-dots-firefox-vX.Y.Z.zip`  
Pasta: `dist/firefox/` (sem localhost)

## Diferenças vs Chrome

| Item | Chrome | Firefox |
|------|--------|---------|
| Manifests | `manifest.json` / `manifest.prod.json` | `manifest.firefox.json` / `manifest.firefox.prod.json` |
| Background | `service_worker` + `importScripts` | `background.scripts` |
| Opções | `options_page` | `options_ui` (`open_in_tab`) |
| Hosts | matches com `:5500` ok | sem porta em localhost |
| Permissions | `storage`, `tabs`, `windows` | `storage`, `tabs` (`windows` API sem permissão no manifest) |
| Load temp | raiz do repo | **`load-in-firefox/`** (nunca a raiz) |

## AMO / privacidade

Os manifests Firefox declaram:

```json
"data_collection_permissions": {
  "required": ["none"]
}
```

A extensão não coleta nem transmite dados para servidores próprios; configurações e cálculos ficam no storage local da extensão.
