import express, { Request, Response } from 'express'
import swaggerUi from 'swagger-ui-express'
import { swaggerDocs, swaggerExplorerOptions } from './configs/swagger.config'

const app = express()
const port = parseInt(process.env.API_DOCS_PORT || '6655', 10)

app.get('/', (req: Request, res: Response) => {
    res.redirect('/api-docs')
})

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs, swaggerExplorerOptions))

app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Chronos API documentation server listening on port ${port}`)
})
