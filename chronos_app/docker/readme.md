# Chronos Docker

```bash
docker compose up -d
docker compose stop
docker compose remove
```

## Env Variables

If you like to persist your data (flows, logs, credentials, storage), set these variables in the `.env` file inside `docker` folder:

```bash
# see .env.example for enviroenment variables reference
DATABASE_PATH=/root/.chronos
LOG_PATH=/root/.chronos/logs
SECRETKEY_PATH=/root/.chronos
BLOB_STORAGE_PATH=/root/.chronos/storage
```


## Examples

Multiple examples exists in this directory to to showcase more complex Cronos AI agent builder deployments. Including workers / queue mode; vector database and self hosted ollama setup; and others:

- [single service deployment](./docker-compose.yml)
- [multiple worker example](./docker-compose-workers.yml)
- [vector embeddings with self hosted models](./docker-compose-vectordb.yml)

For more detailed documentation and tutorials, visit [popularowl.com/chronos](https://www.popularowl.com/chronos/). 

We [provide professional services assistance](https://www.popularowl.com/about/) to deploy Chronos visual AI agent builder for your organization.
