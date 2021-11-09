import Peer from 'peerjs'
import Network from '../services/Network'
import store from '../stores'
import { setVideoConnected } from '../stores/UserStore'

export default class WebRTC {
  private myPeer: Peer
  peers = new Map<string, Peer.MediaConnection>()
  onCalledVideos = new Map<string, HTMLVideoElement>()
  private videoGrid = document.querySelector('.video-grid')
  private buttonGrid = document.querySelector('.button-grid')
  private myVideo = document.createElement('video')
  private myStream?: MediaStream
  private network: Network

  constructor(userId: string, network: Network) {
    const sanitizedId = this.replaceInvalidId(userId)
    this.myPeer = new Peer(sanitizedId)
    this.network = network
    console.log('userId:', userId)
    console.log('sanitizedId:', sanitizedId)
    this.myPeer.on('error', (err) => {
      console.log(err.type)
      console.log(err)
    })

    // mute your own video stream (you don't want to hear yourself)
    this.myVideo.muted = true

    this.initialize()
    this.getUserMedia()
  }

  // PeerJS throws invalid_id error if it contains some characters such as that colyseus generates.
  // https://peerjs.com/docs.html#peer-id
  private replaceInvalidId(userId: string) {
    return userId.replace(/[^0-9a-z]/gi, 'G')
  }

  initialize() {
    this.myPeer.on('call', (call) => {
      call.answer()
      const video = document.createElement('video')

      call.on('stream', (userVideoStream) => {
        this.addVideoStream(video, userVideoStream)
      })
      // triggered only when the connected peer is destroyed
      call.on('closed', () => {
        video.remove()
        this.onCalledVideos.delete(call.peer)
      })
      call.on('error', (err) => {
        console.log(err)
      })
      this.onCalledVideos.set(call.peer, video)
    })
    this.network.readyToConnect()
  }

  getUserMedia() {
    store.dispatch(setVideoConnected(true))
    // ask the browser to get user media
    navigator.mediaDevices
      ?.getUserMedia({
        video: true,
        audio: true,
      })
      .then((stream) => {
        this.myStream = stream
        this.addVideoStream(this.myVideo, this.myStream)

        // prepare to be called
        this.myPeer.on('call', (call) => {
          call.answer(this.myStream)
          // const video = document.createElement('video')

          // call.on('stream', (userVideoStream) => {
          //   this.addVideoStream(video, userVideoStream)
          // })
          // // triggered only when the connected peer is destroyed
          // call.on('closed', () => {
          //   video.remove()
          //   this.onCalledVideos.delete(call.peer)
          // })
          // call.on('error', (err) => {
          //   console.log(err)
          // })
          // this.onCalledVideos.set(call.peer, video)
        })
        this.setUpButtons()
        this.network.readyToConnect()
      })
      .catch((error) => {
        // this.initialize()
        store.dispatch(setVideoConnected(false))
      })
  }

  // method to call a peer
  connectToNewUser(userId: string) {
    if (!this.myStream) return false
    const sanitizedId = this.replaceInvalidId(userId)
    const call = this.myPeer.call(sanitizedId, this.myStream)
    if (call) {
      const video = document.createElement('video')
      call.on('stream', (userVideoStream) => {
        this.addVideoStream(video, userVideoStream)
      })
      call.on('close', () => {
        video.remove()
      })

      this.peers.set(sanitizedId, call)
      return true
    }
    return false
  }

  // method to add new video stream to videoGrid div
  addVideoStream(video: HTMLVideoElement, stream: MediaStream) {
    video.srcObject = stream
    video.addEventListener('loadedmetadata', () => {
      video.play()
    })
    if (this.videoGrid) this.videoGrid.append(video)
  }

  // method to remove video stream (when we are the host of the call)
  deleteVideoStream(userId: string) {
    const sanitizedId = this.replaceInvalidId(userId)
    if (this.peers.has(sanitizedId)) {
      const peerCall = this.peers.get(sanitizedId)
      peerCall?.close()
      this.peers.delete(sanitizedId)
    }
  }

  // method to remove video stream (when we are the guest of the call)
  deleteOnCalledVideoStream(userId: string) {
    const sanitizedId = this.replaceInvalidId(userId)
    if (this.onCalledVideos.has(sanitizedId)) {
      const video = this.onCalledVideos.get(sanitizedId)
      video?.remove()
      this.onCalledVideos.delete(sanitizedId)
    }
  }

  // method to set up mute/unmute and video on/off buttons
  setUpButtons() {
    const audioButton = document.createElement('button')
    audioButton.innerText = 'Mute'
    audioButton.addEventListener('click', () => {
      if (this.myStream) {
        const audioTrack = this.myStream.getAudioTracks()[0]
        if (audioTrack.enabled) {
          audioTrack.enabled = false
          audioButton.innerText = 'Unmute'
        } else {
          audioTrack.enabled = true
          audioButton.innerText = 'Mute'
        }
      }
    })
    const videoButton = document.createElement('button')
    videoButton.innerText = 'Video off'
    videoButton.addEventListener('click', () => {
      if (this.myStream) {
        const audioTrack = this.myStream.getVideoTracks()[0]
        if (audioTrack.enabled) {
          audioTrack.enabled = false
          videoButton.innerText = 'Video on'
        } else {
          audioTrack.enabled = true
          videoButton.innerText = 'Video off'
        }
      }
    })
    this.buttonGrid?.append(audioButton)
    this.buttonGrid?.append(videoButton)
  }
}
