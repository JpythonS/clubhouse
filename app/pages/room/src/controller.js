import { constants } from "../../_shared/constants.js"
import Attendee from "./entities/attendee.js"

export default class RoomController {
  constructor({ roomInfo, socketBuilder, view, peerBuilder, roomService }) {
    this.socketBuilder = socketBuilder
    this.peerBuilder = peerBuilder
    this.roomInfo = roomInfo
    this.view = view
    this.roomService = roomService
    this.socket = {}
  }

  static async initialize(deps) {
    return new RoomController(deps)._initialize()
  }

  async _initialize() {
    this._setupViewEvents()
    this.roomService.init()
    this.socket = this._setupSocket()
    this.roomService.setCurrentPeer(await this._setupWebRTC())
  }

  _setupViewEvents() {
    this.view.configureOnMicrophoneActivation(this.onMicrophoneActivation())
    this.view.configureLeaveButton()
    this.view.configureClapButton(this.onClapPressed())
    this.view.updateUserImage(this.roomInfo.user)
    this.view.updateRoomTopic(this.roomInfo.room)
  }

  onMicrophoneActivation() {
    return async () => {
      await this.roomService.toggleAudioActivation()
    }
  }

  onClapPressed() {
    return () => {
      this.socket.emit(constants.events.SPEAK_REQUEST, this.roomInfo.user)
    }
  }

  _setupSocket() {
    return this.socketBuilder
      .setOnUserConnected(this.onUserConnected())
      .setOnUserDisconnected(this.onUserDisconnected())
      .setOnRoomUpdated(this.onRoomUpdated())
      .setOnUserProfileUpgrade(this.onUserProfileUpgrade())
      .setOnSpeakRequested(this.onSpeakRequested())
      .build()
  }

  onSpeakRequested() {
    return (data) => {
      const attendee = new Attendee(data)
      const result = prompt(
        `${attendee.username} pediu para falar!, aceitar? 1 sim, 0 não`
      )
      this.socket.emit(constants.events.SPEAK_ANSWER, {
        answer: !!Number(result),
        attendee,
      })
    }
  }

  async _setupWebRTC() {
    return this.peerBuilder
      .setOnError(this.onPeerError())
      .setOnConnectionOpened(this.onPeerConnectionOpened())
      .setOnCallReceived(this.onCallReceived())
      .setOnCallError(this.onCallError())
      .setOnCallClose(this.onCallClose())
      .setOnStreamReceived(this.onStreamReceived())
      .build()
  }

  onStreamReceived() {
    return (call, stream) => {
      const callerId = call.peer
      const { isCurrentId } = this.roomService.addReceivedPeer(call)
      // console.warn("audio desabilitado")
      this.view.renderAudioElement({
        callerId,
        stream,
        isCurrentId,
      })
      console.log("onStreamReceived", call, stream)
    }
  }

  onCallClose() {
    return (call) => {
      const peerId = call.peer
      this.roomService.disconnectPeer({ peerId })
      console.log("onCallClose", call)
    }
  }

  onCallError() {
    return (call, error) => {
      const peerId = call.peer
      this.roomService.disconnectPeer({ peerId })
      console.log("onCallError", call, error)
    }
  }

  onCallReceived() {
    return async (call) => {
      const stream = await this.roomService.getCurrentStream()
      console.log("answering call", call)
      call.answer(stream)
    }
  }

  onPeerError() {
    return (error) => {
      console.error("deu ruim", error)
    }
  }

  // quando a conexao for aberta ele pede para entrar na room do socket
  onPeerConnectionOpened() {
    return (peer) => {
      this.roomInfo.user.peerId = peer.id
      this.socket.emit(constants.events.JOIN_ROOM, this.roomInfo)
      console.log("peeer", peer)
    }
  }

  onUserProfileUpgrade() {
    return (data) => {
      const attendee = new Attendee(data)

      if (attendee.isSpeaker) {
        this.roomService.upgradeUserPermission(attendee)
        this.view.addAttendeeOnGrid(attendee, true)
      }

      this.activateUserFeatures()
      console.log("onUserProfileUpgrade", attendee)
    }
  }

  onRoomUpdated() {
    return (data) => {
      const users = data.map((item) => new Attendee(item))
      this.view.updateAttendeesOnGrid(users)
      this.roomService.updateCurrentUserProfile(users)
      this.activateUserFeatures()
      console.log("room list!", users)
    }
  }

  onUserDisconnected() {
    return (data) => {
      const attendee = new Attendee(data)
      this.view.removeItemFromGrid(attendee.id)

      this.roomService.disconnectPeer(attendee)
      console.log(`${attendee.username} disconnected!`)
    }
  }

  onUserConnected() {
    return (data) => {
      const attendee = new Attendee(data)
      this.view.addAttendeeOnGrid(attendee)
      this.roomService.callNewUser(attendee)
      console.log("user connected!", attendee)
    }
  }

  activateUserFeatures() {
    const currentUser = this.roomService.getCurrentUser()
    this.view.showUserFeatures(currentUser.isSpeaker)
  }
}
