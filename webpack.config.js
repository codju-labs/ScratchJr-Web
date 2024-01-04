// webpack.config.js
const path = require("path");

module.exports = {
  entry: "./src/app/appEntry.js",
  mode: "development",
  output: {
    filename: "bundle.js",
    path: path.resolve(__dirname, "dist"),
  },
  devServer: {
    static: {
      directory: path.join(__dirname, "dist"),
    },
    compress: true,
    port: 3002,
  },
  devtool: "eval-source-map",
};
