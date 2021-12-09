(async() => {
  const {createPayload} = await import('./utilsHCert.mjs')
  console.log(createPayload( {test:1}, 1, 234324 ) )
})()
