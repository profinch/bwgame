# The live server

Who else is standing here, and word of a claim the moment the indexer has it.
Nothing is stored: the chain is the record, the subgraph is the index, this
passes the present moment around. The world works without it.

Rooms are chains. A client says `{"t":"hi","room":"sepolia"}` once, then
`{"t":"at","x":…,"z":…,"yaw":…,"dig":…}` whenever it moves — x and z in metres
from the corner of the world, so two clients with different homes agree — and
hears `{"t":"peers",…}` ten times a second and `{"t":"changed","plots":[…]}`
when the subgraph reports a plot claimed, written into or handed on.

```bash
npm install
SUBGRAPH=https://api.studio.thegraph.com/query/1760017/ground-state/v0.5.0 npm start
```

On the server it runs as the `gs-live` container on the `hosting` network, and
nginx proxies `wss://gs.bwtoken.io/live` to it (see `deploy/io-bwtoken-gs.conf`).
