---
'@coaction/react': patch
---

Leave a rendered element's `key` and `ref` unread. An `observer` walks what it
renders for state carried out through props, and read every own key of each
element's props -- including the non-enumerable `key` getter that development
builds of React define to report reading it, so rendering a keyed list logged
"`key` is not a prop". The walk now lists props as React copies them in.
