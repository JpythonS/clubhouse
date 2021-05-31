import { constants } from "../../_shared/constants.js"
import LobbyController from "./controller.js"
import LobbySocketBuilder from "./util/lobbySocket.js"
import View from "./view.js"

const user = {
  img: "https://cdn4.iconfinder.com/data/icons/avatars-xmas-giveaway/128/breaking_bad_chemisrty_avatar_heisenberg-256.png",
  username: "Erick " + Date.now(),
}

const socketBuilder = new LobbySocketBuilder({
  socketUrl: constants.socketUrl,
  namespace: constants.socketNamespaces.lobby,
})

const dependencies = {
  socketBuilder,
  user,
  view: View,
}

LobbyController.initialize(dependencies).catch((error) => {
  alert(error.message)
})
