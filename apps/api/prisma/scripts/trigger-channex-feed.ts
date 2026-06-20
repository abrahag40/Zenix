import { NestFactory } from '@nestjs/core'
import { AppModule } from '../../src/app.module'
import { ChannexFeedScheduler } from '../../src/integrations/channex/inbound/channex-feed.scheduler'

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error', 'log'] })
  const feed = app.get(ChannexFeedScheduler)
  const res = await feed.run({ source: 'manual' })
  console.log('FEED RESULT:', JSON.stringify(res))
  await app.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
