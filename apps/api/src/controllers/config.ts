import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { config } from '../config.js'
import { dataResponse } from '../schemas/responses.js'

const ProviderSchema = z
    .object({
        id: z.enum(['discord', 'iut']).openapi({ example: 'iut' }),
        label: z.string().openapi({ example: 'Dép. Info.' }),
    })
    .openapi('AuthProvider')

const app = new OpenAPIHono()

app.openapi(
    createRoute({
        method: 'get',
        path: '/',
        operationId: 'getPublicConfig',
        summary: 'What this deployment offers',
        description:
            'Lets the frontend render one login button per configured provider instead of hardcoding them: an instance with no `iut` block advertises only Discord, and another department sets its own `displayName` without rebuilding the image.',
        tags: ['Config'],
        responses: {
            200: dataResponse(
                z.object({ providers: z.array(ProviderSchema) }),
                'Public configuration',
            ),
        },
    }),
    (c) => {
        const providers = [
            { id: 'discord' as const, label: 'Discord' },
            ...(config.iut ? [{ id: 'iut' as const, label: config.iut.displayName }] : []),
        ]
        return c.json({ data: { providers } }, 200)
    },
)

export default app
