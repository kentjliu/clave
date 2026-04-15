FROM node:20-alpine
WORKDIR /app

# Minimal placeholder server — replaced when the Next.js app is built.
RUN printf 'const http = require("http");\n\
http.createServer((req, res) => {\n\
  const ok = req.url === "/api/health";\n\
  res.writeHead(ok ? 200 : 404);\n\
  res.end(ok ? "ok" : "Clave \u2014 coming soon");\n\
}).listen(3000, () => console.log("placeholder running on :3000"));\n' > server.js

EXPOSE 3000
CMD ["node", "server.js"]
