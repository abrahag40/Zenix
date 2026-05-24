/**
 * Bootstrap smoke test — atrapa bugs de DI module-scoped antes de runtime.
 *
 * Sprint NOVA-CHANNEX-COMMAND-CENTER Day 9 sandbox testing capturó:
 *   "Nest can't resolve dependencies of ChannexRoomTypesService (..., ?, ...).
 *    Please make sure that the argument TenantContextService at index [1]
 *    is available in the ChannexManagementModule context."
 *
 * Causa: NestJS DI es module-scoped — los providers registrados en AppModule
 * NO son visibles para módulos child a menos que se exporten via @Module
 * (con `exports: []`) o se declaren explícitamente en cada module child que
 * los inyecte.
 *
 * Los unit tests Day 5-7 NO atrapaban esto porque construyen los services
 * con `new Service(prismaMock, tenantMock, ...)` — bypass total del DI graph.
 *
 * Este spec instancia el AppModule COMPLETO via Test.createTestingModule.
 * Si cualquier module tiene una dep no-resuelta, Nest throws al compile y
 * este test falla → bug atrapado antes de hacer commit.
 *
 * Pattern equivalente a:
 *   - Stripe "Application boot test"
 *   - Spring Boot "@SpringBootTest" smoke
 *   - Rails "rails routes" + "rails console" load test
 *
 * NO probamos lógica — solo que el grafo DI es coherente. Es el equivalente
 * test de "compila pero NestJS también pudo construir el grafo".
 */
import { Test } from '@nestjs/testing'
import { AppModule } from './app.module'

describe('AppModule bootstrap — DI graph integrity', () => {
  it('compila el grafo completo de dependencias sin errores', async () => {
    // Si CUALQUIER provider o controller tiene una dep no resuelta, esta
    // llamada throws con el mensaje exacto del bug que vimos en sandbox.
    // No necesitamos init() — la compile() ya valida el grafo.
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    // Cleanup
    await moduleRef.close()
  }, 30_000) // timeout generoso — AppModule importa muchos child modules
})
