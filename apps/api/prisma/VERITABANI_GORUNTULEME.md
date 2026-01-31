# Veritabanını Görüntüleme

## Seçenek A: Prisma Studio (şema ile DB uyumlu olmalı)

Eksik sütunlar eklenmişse:

```bash
pnpm db:push
# sonra:
pnpm db:studio
```

Tarayıcı: http://localhost:5555

---

## Seçenek B: Doğrudan PostgreSQL (Prisma’ya ihtiyaç yok)

Bağlantı:
- **Host:** localhost
- **Port:** 5432
- **Database:** tarodan
- **User:** postgres
- **Password:** postgres

### Araçlar
- **DBeaver** (ücretsiz): https://dbeaver.io/
- **pgAdmin:** https://www.pgadmin.org/
- **VS Code:** "PostgreSQL" veya "Database Client" eklentisi

### Docker ile psql
```bash
docker exec -it tarodan-postgres psql -U postgres -d tarodan
```
Tablo listesi: `\dt`  
Çıkış: `\q`
