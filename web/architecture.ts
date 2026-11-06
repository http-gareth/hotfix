const uptime = (seconds: number) => seconds < 3600 ? `${Math.floor(seconds / 60)} min` : `${Math.floor(seconds / 3600)} h ${Math.floor(seconds % 3600 / 60)} min`

const refresh = async () => {
  const system = await fetch('/api/system').then(response => response.json()).catch(() => null)
  if (!system) return
  for (const node of document.querySelectorAll<HTMLElement>('[data-metric]')) {
    const key = node.dataset.metric!
    const value = key.split('.').reduce((object, part) => object?.[part], system)
    node.textContent = key === 'uptime' ? uptime(value) : Number(value).toLocaleString()
  }
}

const loadTest = async () => {
  const result = await fetch('/web/load-test.json').then(response => response.ok ? response.json() : null).catch(() => null)
  if (!result) return
  for (const node of document.querySelectorAll<HTMLElement>('[data-load]')) node.textContent = Number(result[node.dataset.load!]).toLocaleString()
  document.getElementById('load-about')!.textContent = `${result.players} simulated players in ${result.rooms} rooms for ${result.seconds} seconds against ${result.target}, on ${new Date(result.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}. Reproduce it with npm run load.`
  document.getElementById('load')!.hidden = false
}

refresh()
loadTest()
setInterval(refresh, 2_000)
