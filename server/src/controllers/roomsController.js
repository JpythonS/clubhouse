import Attendee from "../entities/attendee.js"
import Room from "../entities/room.js"
import { constants } from "../util/constants.js"
import CustomMap from "../util/customMap.js"

export default class RoomsController {
  #users = new Map()

  constructor({ roomsPubSub }) {
    this.roomsPubSub = roomsPubSub
    this.rooms = new CustomMap({
      observer: this.#roomObserver(),
      customMapper: this.#mapRoom.bind(this),
    })
  }

  #roomObserver() {
    return {
      notify: (rooms) => this.notifyRoomSubscribers(rooms),
    }
  }

  speakAnswer(socket, { answer, attendee }) {
    const userId = attendee.id
    const currentUser = this.#users.get(userId)
    const updatedUser = new Attendee({
      ...currentUser,
      isSpeaker: answer,
    })

    this.#users.set(userId, updatedUser)

    const roomId = attendee.roomId
    const room = this.rooms.get(roomId)
    const userOnRoom = [...room.users.values()].find(({ id }) => id === userId)
    room.users.delete(userOnRoom)
    room.users.add(updatedUser)
    this.rooms.set(roomId, room)

    socket.emit(constants.event.UPGRADE_USER_PERMISSION, updatedUser)
    this.#notifyUserProfileUpgrade(socket, roomId, updatedUser)
  }

  speakRequest(socket) {
    const userId = socket.id
    const user = this.#users.get(userId)
    const roomId = user.roomId
    const owner = this.rooms.get(roomId)?.owner
    socket.to(owner.id).emit(constants.event.SPEAK_REQUEST, user)
  }

  notifyRoomSubscribers(rooms) {
    const event = constants.event.LOBBY_UPDATED
    this.roomsPubSub.emit(event, [...rooms.values()])
  }

  onNewConnection(socket) {
    const { id } = socket
    console.log("connection stablished with", id)
    this.#updateGlobalUserData(id)
  }

  disconnect(socket) {
    console.log("disconnect!!", socket.id)
    this.#logoutUser(socket)
  }

  #logoutUser(socket) {
    const userId = socket.id
    const user = this.#users.get(userId)
    const roomId = user.roomId
    // remover user da lista de users ativos
    this.#users.delete(userId)

    // caso seja um user sujeira que estava em uma room que n??o existe mais
    if (!this.rooms.has(roomId)) {
      return
    }

    const room = this.rooms.get(roomId)
    const toBeRemoved = [...room.users].find(({ id }) => id === userId)

    // removemos o user da sala
    room.users.delete(toBeRemoved)

    // se n??o tiver mais nenhum user na room, matamos a room
    if (!room.users.size) {
      this.rooms.delete(roomId)
      return
    }

    const disconnectedUserWasAnOwner = userId === room.owner.id
    const onlyOneUserLeft = room.users.size === 1

    // validar se tem somente um user ou se o user ?? o owner da room
    if (onlyOneUserLeft || disconnectedUserWasAnOwner) {
      room.owner = this.#getNewRoomOwner(room, socket)
    }

    // atualiza a room no final
    this.rooms.set(roomId, room)

    // notifica a sala que o user se desconectou
    socket.to(roomId).emit(constants.event.USER_DISCONNECTED, user)
  }

  #notifyUserProfileUpgrade(socket, roomId, user) {
    socket.to(roomId).emit(constants.event.UPGRADE_USER_PERMISSION, user)
  }

  #getNewRoomOwner(room, socket) {
    const users = [...room.users.values()]
    const activeSpeakers = users.find((user) => user.isSpeaker)
    // se quem desconectou era o owner, passa o owner para o pr??ximo
    // se n??o houver speakers, pegar o attendee mais antigo (primeira posi????o)
    const [newOwner] = activeSpeakers ? [activeSpeakers] : users
    newOwner.isSpeaker = true

    const outdatedUser = this.#users.get(newOwner.id)
    const updatedUser = new Attendee({
      ...outdatedUser,
      ...newOwner,
    })

    this.#users.set(newOwner.id, updatedUser)
    this.#notifyUserProfileUpgrade(socket, room.id, newOwner)
    return newOwner
  }

  joinRoom(socket, { user, room }) {
    const userId = (user.id = socket.id)
    const roomId = room.id

    const updatedUserData = this.#updateGlobalUserData(userId, user, roomId)

    const updatedRoom = this.#joinUserRoom(socket, updatedUserData, room)
    this.#notifyUsersOnRoom(socket, roomId, updatedUserData)
    this.#replyWithActiveUsers(socket, updatedRoom.users)
  }

  #replyWithActiveUsers(socket, users) {
    const event = constants.event.LOBBY_UPDATED
    socket.emit(event, [...users.values()])
  }

  #notifyUsersOnRoom(socket, roomId, user) {
    const event = constants.event.USER_CONNECTED
    socket.to(roomId).emit(event, user)
  }

  #joinUserRoom(socket, user, room) {
    const roomId = room.id
    const existingRoom = this.rooms.has(roomId)
    const currentRoom = existingRoom ? this.rooms.get(roomId) : {}
    const currentUser = new Attendee({
      ...user,
      roomId,
    })

    // definir quem ?? o dono da sala
    const [owner, users] = existingRoom
      ? [currentRoom.owner, currentRoom.users]
      : [currentUser, new Set()]

    const updatedRoom = this.#mapRoom({
      ...currentRoom,
      ...room,
      owner,
      users: new Set([...users, ...[currentUser]]),
    })

    this.rooms.set(roomId, updatedRoom)

    socket.join(roomId)

    return this.rooms.get(roomId)
  }

  #mapRoom(room) {
    const users = [...room.users.values()]
    const speakersCount = [users.filter((user) => user.isSpeaker).length]
    const featuredAttendees = users.slice(0, 3)
    const mappedRoom = new Room({
      ...room,
      featuredAttendees,
      speakersCount,
      attendeesCount: room.users.size,
    })

    return mappedRoom
  }

  #updateGlobalUserData(userId, userData = {}, roomId = "") {
    const user = this.#users.get(userId) ?? {}
    const existingRoom = this.rooms.has(roomId)

    const updatedUserData = new Attendee({
      ...user,
      ...userData,
      roomId,
      // ser for o unico na sala
      isSpeaker: !existingRoom,
    })
    this.#users.set(userId, updatedUserData)

    return this.#users.get(userId)
  }

  getEvents() {
    const functions = Reflect.ownKeys(RoomsController.prototype)
      .filter((fn) => fn !== "contructor")
      .map((name) => [name, this[name].bind(this)])

    return new Map(functions)
  }
}
