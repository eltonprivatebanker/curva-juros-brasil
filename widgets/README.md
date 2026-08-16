# Widget · Evolução da Curva DI

Depois de enviar a pasta `widgets/` para o repositório, o widget ficará disponível em:

`https://eltonprivatebanker.github.io/curva-juros-brasil/widgets/evolucao-di.html`

## Incorporar em outro site

```html
<iframe
  src="https://eltonprivatebanker.github.io/curva-juros-brasil/widgets/evolucao-di.html"
  title="Evolução da Curva DI"
  width="100%"
  height="650"
  loading="lazy"
  style="border:0; border-radius:18px; overflow:hidden;">
</iframe>
```

O widget lê diretamente `data/index.json` e os snapshots do projeto principal. Não é necessário duplicar os dados no site que recebe o iframe.

## Altura automática opcional

O widget envia via `postMessage` a mensagem:

```js
{
  type: "juros-brasil-widget-height",
  widget: "evolucao-di",
  height: 650
}
```

Se quiser fazer o iframe ajustar a própria altura:

```html
<iframe
  id="widget-curva-di"
  src="https://eltonprivatebanker.github.io/curva-juros-brasil/widgets/evolucao-di.html"
  title="Evolução da Curva DI"
  width="100%"
  height="650"
  style="border:0; border-radius:18px; overflow:hidden;">
</iframe>

<script>
window.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "juros-brasil-widget-height" &&
      data.widget === "evolucao-di" &&
      Number.isFinite(data.height)) {
    document.getElementById("widget-curva-di").style.height =
      `${Math.max(420, data.height)}px`;
  }
});
</script>
```
