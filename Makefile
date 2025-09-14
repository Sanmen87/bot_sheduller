.PHONY: up down logs api bot worker migrate revision alembic


up:
docker-compose up -d --build


down:
docker-compose down -v


logs:
docker-compose logs -f --tail=200


revision:
docker-compose exec api alembic revision -m "init" --autogenerate


migrate:
docker-compose exec api alembic upgrade head