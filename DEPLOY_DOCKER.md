# Docker Deployment

## 1) Prepare `.env`
Keep your existing `.env`, but set these for container deploy:

- `DJANGO_DEBUG=0`
- `DJANGO_ALLOWED_HOSTS=your-domain.com,www.your-domain.com`
- `DB_HOST=db`
- `DB_PORT=5432`
- `DB_NAME=ihatebackground`
- `DB_USER=ihatebackground`
- `DB_PASSWORD=ihatebackground`
- `CELERY_BROKER_URL=redis://redis:6379/0`
- `CELERY_RESULT_BACKEND=redis://redis:6379/1`
- `REDIS_URL=redis://redis:6379/2`

Also configure your OAuth and payment env keys if you use those features.

## 2) Build and run
```bash
docker compose up -d --build
```

## 3) Check services
```bash
docker compose ps
docker compose logs -f web
docker compose logs -f worker
docker compose logs -f beat
```

App URL:
- `http://localhost` (served by nginx)
- Django internal service stays on `web:8000`

## Optional HTTPS (SSL-ready)
1. Put certificates in `nginx/certs/`:
   - `fullchain.pem`
   - `privkey.pem`
2. In `docker-compose.yml`, uncomment:
   - `- "443:443"`
   - `- ./nginx/certs:/etc/nginx/certs:ro`
3. In `nginx/conf.d/default.conf`, uncomment the HTTPS server block and set your domain.
4. Restart:
```bash
docker compose up -d --build
```

## 4) Stop
```bash
docker compose down
```

## 5) Full reset (deletes DB volume)
```bash
docker compose down -v
```
