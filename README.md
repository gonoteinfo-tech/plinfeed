# AutoNews AI — Deploy Hostinger VPS

## Requisitos
- **Hostinger VPS** com Node.js 18+ instalado
- **PM2** instalado globalmente: `npm install -g pm2`
- **Banco Supabase** ja configurado (o mesmo usado em desenvolvimento)

## Instalacao

### 1. Enviar arquivos para o VPS
Upload deste ZIP via SFTP ou File Manager do Hostinger.
Extraia para `/home/SEU-USUARIO/autonews/`.

### 2. Configurar variaveis de ambiente
```bash
cd /home/SEU-USUARIO/autonews
cp .env.production .env
nano .env
```

Preencha:
- `NEXT_PUBLIC_API_URL` → URL publica da API (ex: `https://seudominio.com/api`)
- `DATABASE_URL` → String de conexao do Supabase
- `JWT_SECRET` → Gere com: `openssl rand -hex 32`
- `OPENAI_API_KEY` → Sua chave OpenAI
- `CORS_ORIGIN` → URL do frontend (ex: `https://seudominio.com`)
- `APP_FRONTEND_URL` → Mesmo que `CORS_ORIGIN`

### 3. Instalar dependencias da API
```bash
npm run setup
```

### 4. Aplicar migracoes do banco
```bash
npm run migrate
```

### 5. Popular dados iniciais (opcional)
```bash
npm run seed
```

### 6. Iniciar os servicos
```bash
npm start
```

### 7. Verificar status
```bash
npm run status
npm run logs
```

## Nginx (Reverse Proxy)

Configure o Nginx para rotear o trafego:

```nginx
server {
    listen 80;
    server_name seudominio.com;

    # Frontend Next.js
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # API Express
    location /api {
        proxy_pass http://localhost:4000/api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## SSL (Let's Encrypt)
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d seudominio.com
```

## PM2 — Auto-start no boot
```bash
pm2 startup
pm2 save
```

## Estrutura do Deploy
```
autonews/
├── .env                     ← Suas credenciais (criar a partir do .env.production)
├── .env.production          ← Template de referencia
├── ecosystem.config.cjs     ← Configuracao PM2
├── package.json             ← Scripts de deploy
├── api/
│   ├── dist/                ← API compilada (JavaScript)
│   ├── prisma/              ← Schema + migrations
│   └── package.json         ← Dependencias da API
├── web/
│   └── standalone/          ← Next.js standalone build
└── logs/                    ← Logs do PM2 (criado automaticamente)
```

## Comandos uteis
| Comando | Descricao |
|---|---|
| `npm start` | Inicia API + Web via PM2 |
| `npm stop` | Para todos os servicos |
| `npm run restart` | Reinicia todos os servicos |
| `npm run logs` | Ver logs em tempo real |
| `npm run status` | Ver status dos processos |
| `npm run migrate` | Aplicar migracoes do banco |
| `npm run seed` | Popular dados iniciais |

## Login padrao
- **Email:** admin@autonews.ai
- **Senha:** Admin123!

> ⚠️ Troque a senha apos o primeiro login!
