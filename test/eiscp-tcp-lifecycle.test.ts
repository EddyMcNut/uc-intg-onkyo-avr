import net from "node:net";
import { describe, expect, it } from "vitest";
import EiscpDriver from "../src/eiscp.js";
import { createEiscpPacket } from "../src/eiscp-packet.js";

async function startServer(onConnection: (socket: net.Socket) => void): Promise<{ server: net.Server; port: number }> {
  const server = net.createServer(onConnection);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind to a TCP port");
  return { server, port: address.port };
}

async function closeServer(server: net.Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

describe("EiscpDriver TCP lifecycle", () => {
  it("emits close when the AVR socket is closed", async () => {
    let peer: net.Socket | undefined;
    const { server, port } = await startServer((socket) => {
      peer = socket;
    });
    const driver = new EiscpDriver({ model: "TX-RZ50", host: "127.0.0.1", port });
    const closed = new Promise<void>((resolve) => driver.once("close", resolve));

    await driver.connect();
    await driver.waitForConnect(1000);
    peer?.destroy();
    await closed;

    expect(driver.connected).toBe(false);
    await closeServer(server);
  });

  it("destroys an active socket when disconnect is called", async () => {
    const { server, port } = await startServer(() => {});
    const driver = new EiscpDriver({ model: "TX-RZ50", host: "127.0.0.1", port });
    const closed = new Promise<void>((resolve) => driver.once("close", resolve));

    await driver.connect();
    await driver.waitForConnect(1000);
    driver.disconnect();
    await closed;

    expect(driver.connected).toBe(false);
    await closeServer(server);
  });

  it("parses a frame split across TCP data events", async () => {
    const frame = createEiscpPacket("PWR01");
    const { server, port } = await startServer((socket) => {
      socket.write(frame.subarray(0, 7));
      setImmediate(() => socket.write(frame.subarray(7)));
    });
    const driver = new EiscpDriver({ model: "TX-RZ50", host: "127.0.0.1", port });
    const update = new Promise<{ command?: string; argument?: unknown }>((resolve) => driver.once("data", resolve));

    await driver.connect();
    await driver.waitForConnect(1000);
    await expect(update).resolves.toMatchObject({ command: "system-power", argument: "on" });

    driver.disconnect();
    await closeServer(server);
  });

  it("shares one socket when connect is called concurrently", async () => {
    let connectionCount = 0;
    let accepted!: () => void;
    const acceptedPromise = new Promise<void>((resolve) => (accepted = resolve));
    const { server, port } = await startServer(() => {
      connectionCount++;
      accepted();
    });
    const driver = new EiscpDriver({ model: "TX-RZ50", host: "127.0.0.1", port });

    await Promise.all([driver.connect(), driver.connect(), driver.connect()]);
    await driver.waitForConnect(1000);
    await acceptedPromise;

    expect(connectionCount).toBe(1);
    driver.disconnect();
    await closeServer(server);
  });
});
