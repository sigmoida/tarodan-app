import { TarodanWebSocketGateway } from "./websocket.gateway";
import { userBlockServiceStub } from "../user-block/user-block.testing";

/**
 * Hesap silindiğinde açık soketler kapanmalı: aksi hâlde silinmiş hesap, token
 * süresi dolana dek kişisel odasından canlı olay almaya devam ederdi.
 */
describe("TarodanWebSocketGateway.disconnectUser", () => {
  const makeGateway = () =>
    new TarodanWebSocketGateway(
      {} as never, // jwtService
      {} as never, // configService
      {} as never, // prisma
      {} as never, // securityService
      userBlockServiceStub() as never, // userBlocks
    );

  it("kullanıcının kişisel odasındaki bütün soketleri kapatır", () => {
    const gateway = makeGateway();
    const disconnectSockets = jest.fn();
    const inRoom = jest.fn().mockReturnValue({ disconnectSockets });
    gateway.server = { in: inRoom } as never;

    gateway.disconnectUser("u1");

    expect(inRoom).toHaveBeenCalledWith("user:u1");
    expect(disconnectSockets).toHaveBeenCalledWith(true);
  });

  it("sunucu henüz kurulmamışsa (gateway başlatılmamış) fırlatmaz", () => {
    const gateway = makeGateway();

    expect(() => gateway.disconnectUser("u1")).not.toThrow();
  });
});
