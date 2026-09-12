module.exports = [
    {
        ignores: [
            "node_modules/**",
            "dist/**",
            "test-results/**",
            ".runtime-test/**",
            "index.js",
        ],
    },
    {
        files: ["**/*.js", "**/*.cjs"],
        languageOptions: { ecmaVersion: "latest", sourceType: "commonjs" },
        rules: {
            "no-unused-vars": "error",
            "no-unreachable": "error",
            "no-constant-condition": "error",
            "no-dupe-keys": "error",
            "no-async-promise-executor": "error",
            eqeqeq: "error",
        },
    },
];
