/** @type {import('next').NextConfig} */
const nextConfig = {
    async rewrites() {
        return [
            {
                source: '/api/:path*',
                destination: 'http://localhost:3002/api/:path*',
            },
        ]
    },
    env: {
        PORT: '3001'
    }
}

module.exports = nextConfig 