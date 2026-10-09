module.exports = {
    plugins: {
        'posthtml-parser': {
            lowerCaseTags: false,
            upperCaseTags: false,
            recognizeCDATA: true,
            recognizeSelfClosing: true
        },
        'htmlnano': {
            collapseWhitespace: true,
            removeComments: true,
            minifyCSS: true,
            minifyJS: true,
            minifyURLs: true,
            removeEmptyAttributes: true,
            removeRedundantAttributes: true,
            removeOptionalTags: false
        }
    }
}; 