export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

export const element = (tag: string, className = '', text = '') => {
  const node = document.createElement(tag)
  node.className = className
  node.textContent = text
  return node
}
