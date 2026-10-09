import { AiOperationsCatalogService } from './ai-operations.catalog';

describe('AiOperationsCatalogService.serialize', () => {
  it('marks openai variants as supportsUserKey and implemented', () => {
    const service = new AiOperationsCatalogService({} as never);
    const providers = service.listProviders();
    expect(providers.find((p) => p.id === 'openai')?.implemented).toBe(true);

    const serialized = (
      service as unknown as {
        serializeVariant: (v: {
          creditCost: number;
          provider: string;
          id: string;
        }) => { supportsUserKey: boolean; creditCost: string };
      }
    ).serializeVariant({
      id: 'v1',
      provider: 'openai',
      creditCost: 1,
    });
    expect(serialized.supportsUserKey).toBe(true);
    expect(serialized.creditCost).toBe('1');

    const replicate = (
      service as unknown as {
        serializeVariant: (v: {
          creditCost: number;
          provider: string;
        }) => { supportsUserKey: boolean };
      }
    ).serializeVariant({ provider: 'replicate', creditCost: 2 });
    expect(replicate.supportsUserKey).toBe(true);

    const google = (
      service as unknown as {
        serializeVariant: (v: {
          creditCost: number;
          provider: string;
        }) => { supportsUserKey: boolean };
      }
    ).serializeVariant({ provider: 'google', creditCost: 2 });
    expect(google.supportsUserKey).toBe(true);

    const stability = (
      service as unknown as {
        serializeVariant: (v: {
          creditCost: number;
          provider: string;
        }) => { supportsUserKey: boolean };
      }
    ).serializeVariant({ provider: 'stability', creditCost: 2 });
    expect(stability.supportsUserKey).toBe(false);
  });
});
