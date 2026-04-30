export function createMockResponse() {
  const response: any = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      response.statusCode = code
      return response
    },
    json(payload: unknown) {
      response.body = payload
      return response
    },
  }

  return response
}
