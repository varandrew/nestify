import { env } from '@nestify/config';

export default {
    env: env('NODE_ENV'),
    port: env('PORT'),
    prefix: 'api',
    isDev() {
        const env = this.get('app.env');
        return env === 'development';
    },
    cors: { origin: '*' }
};