const path = require('path');

module.exports = () => {
  return {
    entry: path.resolve(__dirname, 'src', 'index.js'),
    devtool: 'inline-source-map',
    resolve: {
      extensions: [
        '.js',
      ]
    },
    output: {
      filename: 'content.js',
      path: path.resolve(__dirname, 'app', 'scripts')
    }
  }
}
