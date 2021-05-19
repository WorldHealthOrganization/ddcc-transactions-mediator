const presets = [
  [
    '@babel/env',
    {
      targets: {
        node: true
      }
    }
  ]
]

const plugins = [
]

if ( process.env.STANDALONE ) {
  plugins.push(
    [ "babel-plugin-transform-strip-block", { "requireDirective": true, "identifiers": [{ "start": "openhim:start", "end": "openhim:end" }] }]
  )
}

module.exports = {presets, plugins}
