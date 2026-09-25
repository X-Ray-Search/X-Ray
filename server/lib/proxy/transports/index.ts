import type { ProxyTransport } from "../transport";
import { DirectTransport } from "./direct";
import { HttpProxyTransport } from "./http";
import { Socks5Transport } from "./socks5";
import { XRayGatewayTransport } from "./xrayGateway";

/**
 * All proxy types known to X-Ray. Register new `ProxyTransport` subclasses here.
 */
export class ProxyTransportRegistry {
	private static readonly types = new Map<string, ProxyTransport.Class>();

	static register(cls: ProxyTransport.Class<any>) {
		if (this.types.has(cls.definition.type)) {
			throw new Error(`Proxy type '${cls.definition.type}' is already registered`);
		}
		this.types.set(cls.definition.type, cls);
		return this;
	}

	static get(type: string): ProxyTransport.Class | undefined {
		return this.types.get(type);
	}

	static list(): ProxyTransport.Class[] {
		return [...this.types.values()];
	}
}

ProxyTransportRegistry.register(DirectTransport)
	.register(HttpProxyTransport)
	.register(Socks5Transport)
	.register(XRayGatewayTransport);
