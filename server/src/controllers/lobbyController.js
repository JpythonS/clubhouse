import { constants } from "../util/constants.js"

export default class LobbyController {
  constructor({ activeRooms, roomsListener }) {
    this.activeRooms = activeRooms
    this.roomsListener = roomsListener
  }

  onNewConnection(socket) {
    const { id } = socket
    this.#updateLobbyRooms(socket, [...this.activeRooms.values()])
    console.log("[Lobby] connection stablished with", id)
  }

  #updateLobbyRooms(socket, activeRooms) {
    socket.emit(constants.event.LOBBY_UPDATED, activeRooms)
  }

  getEvents() {
    const functions = Reflect.ownKeys(LobbyController.prototype)
      .filter((fn) => fn !== "contructor")
      .map((name) => [name, this[name].bind(this)])

    return new Map(functions)
  }
}
