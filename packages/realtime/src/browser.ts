// eslint-disable-next-line no-restricted-imports
import * as Ably from "ably";

export interface ChannelSubscription {
  unsubscribe(): void;
}

/**
 * Browser-side subscribe helper so app code never imports the vendor SDK
 * directly (PLAN §7). `tokenUrl` is an endpoint returning a TokenRequest
 * JSON (see the Ably adapter's authorize()); ably-js re-fetches it on
 * token expiry automatically.
 */
export function subscribeToChannel(args: {
  tokenUrl: string;
  channel: string;
  onEvent: (event: string, payload: unknown) => void;
}): ChannelSubscription {
  const client = new Ably.Realtime({ authUrl: args.tokenUrl, authMethod: "GET" });
  const channel = client.channels.get(args.channel);
  void channel.subscribe((message) => {
    args.onEvent(message.name ?? "", message.data);
  });
  return {
    unsubscribe() {
      channel.unsubscribe();
      client.close();
    },
  };
}
