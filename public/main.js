(function () {

  /* **** Variable definitions - top level for reuse to prevent gc **** */
  var container, camera, scene, renderer, particles, geometry, material, i, h,
  sprite, size, uniforms, attributes, width, height, imgWidth, imgHeight,
  imageBuffer, imageBufferNum, workerBuffer

  var numPics = 13
  var currentPic = 1
  var ready = true
  var frame = 0
  var $thumbnails = []
  var sidebarScrollDebounce = 0
  var started = false
  var zoom = 0
  var debug = false

  // only log when in debug mode
  var log = debug ? console.log.bind(console) : function(){}

  // hacky - [0] is for img buffering, [1] is for sidebar scrolling
  var animationEndCallbacks = [function (cb) {
    cb()
  }, function (cb) {
    cb()
  }]

  /* *** requestAnimationFrame shim *** */
  window.requestAnimFrame = (function () {
    return window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || function (callback) {
      window.setTimeout(callback, 1000 / 60);
    };
  })();

  // Bind events and load sidebar
  $(function () {
    $('#sidebar-taz')[0].scrollTop = 0
    $('#start-button-taz').bind('click', start)
    $('#fullscreen-button-taz').bind('click', fullscreen)

    // Reset app on fullscreen change
    $(window).bind('webkitfullscreenchange mozfullscreenchange', function () {
      $('#container-taz canvas').remove()
      initOverlay()
      started = false
      updateSidebarImages()
    }).bind('beforeunload', function () {

      // Fixes Firefox sidebar scroll sticking issue
      $('#sidebar-taz')[0].scrollTop = 0
    })

    initSidebar()
  })

  function initSidebar() {

    // add thumbnail holders
    for (i = 1; i <= numPics; i++) {
      var $thumb = $('<div>')
      $thumb.addClass('thumbnail-taz')
      $thumb.data('num', i)
      $thumb.bind('click', function () {
        selectImage($(this).data('num'))
      })
      $('#sidebar-taz').append($thumb)
      $thumbnails.push($thumb)
    }

    // cache offset data on element to prevent css reflows
    for (i = 0; i < $thumbnails.length; i++) {
      var $el = $thumbnails[i]
      $el.data('top', $el.offset().top)
      $el.data('height', $el.height())
    }

    // buffer initial thumbnails
    updateSidebarImages()

    // instantiate scroll listeners for sidebar
    // debounced to be called after 200ms
    $('#sidebar-taz').bind('scroll', (function (func, wait) {
      var timeout = null
      return function () {
        var context = this,
          args = arguments;
        var later = function () {
          timeout = null;
          func.apply(context, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    })(updateSidebarImages, 200))
  }

  function updateSidebarImages() {
    log('updating sidebar images')
    var $sidebar = $('#sidebar-taz')
    var sideBarScroll = $sidebar.scrollTop()

    // Get viewable area
    var viewBox = {
      top: sideBarScroll,
      bottom: sideBarScroll + $sidebar.height()
    }

    // Buffer next few non-visible elements for a smoother experience
    var doNext = 0
    debug && console.time('sidebar')

    // Check sidebar elements to see if they are visible and need to be rendered
    for (i = 0; i < $thumbnails.length; i++) {
      var $el = $thumbnails[i]
      if (!$el) continue;
      var top = $el.data('top')
      var bottom = top + $el.data('height')

      var visible = top <= viewBox.bottom && bottom >= viewBox.top && !$el.data('loaded')
      if (visible || doNext) {
        var spinner = new Spinner({
          color: 'white'
        }).spin($el[0])

        var img = new Image()

        img.onload = (function ($el, spinner) {
          return function loaded() {
            spinner.stop()
            $el.append(this)
          }
        })($el, spinner)

        img.src = 'thumb/' + (i + 1) + '.jpg'
        $el.data('loaded', true)

        // preload next 4 images
        doNext = visible ? 4 : doNext - 1
      }
    }
    debug && console.timeEnd('sidebar')
  }

  /* **** These functions control the overlay before starting **** */
  function initOverlay() {
    $('#overlay-taz').show()
  }

  function drawLoading() {
    $('#overlay-taz #loading-taz').show()
    $('#overlay-taz #buttons-taz').hide()
  }

  function clearOverlay() {
    // remove overlay
    $('#overlay-taz').hide()
    $('#overlay-taz #loading-taz').hide()
    $('#overlay-taz #buttons-taz').show()
  }

  // attach listeners for slide changes
  function attachListeners() {
    $('#container-taz').bind('mousedown', next)
    Mousetrap.bind(['right', 'j', 'space', 'enter', 'down'], next)
    Mousetrap.bind(['left', 'k', 'backspace', 'up'], prev)
  }

  function fullscreen() {
    var el = $('#main-taz')[0]
    el.requestFullScreen && el.requestFullScreen() || el.webkitRequestFullScreen && el.webkitRequestFullScreen() || el.mozRequestFullScreen && el.mozRequestFullScreen()
  }

  function next() {
    if (currentPic + 1 <= numPics) {
      selectImage(currentPic + 1)
    }
  }

  function prev() {
    if (currentPic >= 1) {
      selectImage(currentPic - 1)
    }
  }

  function getImageSize() {
    var originalImageWidth = 1624
    var originalImageHeight = 1080
    // scale image to fit snugly inside of frame
    var scale = width / originalImageWidth
    if (originalImageHeight * scale > height) {
      scale = height / originalImageHeight
    }
    var w = Math.floor(originalImageWidth * scale)
    var h = Math.floor(originalImageHeight * scale)

    return {
      width: w,
      height: h
    }
  }

  function renderImage() {
    geometry.attributes.color.needsUpdate = true
  }

  function bufferImage(num) {
    animationEndCallbacks[0] = function (cb) {
      loadImage(num, true, cb)
    }
  }

  function selectImage(pic) {
    if (!started || !ready) return;
    log('selecting', pic)
    ready = false
    $thumbnails[currentPic - 1].removeClass('selected-taz')
    currentPic = pic
    $thumbnails[currentPic - 1].addClass('selected-taz')

    animationEndCallbacks[1] = function (cb) {
      $('#sidebar-taz').animate({
        scrollTop: $thumbnails[currentPic - 1].data('top') - 20
      }, 250)
      setTimeout(cb, 250)
    }

    loadImage(pic, false, function (colors) {
      uniforms.transition.value = (uniforms.transition.value + 1) % 10
      animate(function () {
        renderImage(colors)
      })
    })
  }

  function loadImage(num, buffer, cb) {
    log('loading image', num)

    if (num <= 0 || num > numPics) return cb();

    // check buffered images
    if (imageBufferNum === num) {
      log('image', num, 'hit buffer')
      // load buffered image
      var t = geometry.attributes.color.array
      geometry.attributes.color.array = imageBuffer
      imageBuffer = t

      // buffer next image
      !buffer && bufferImage(num + 1)
      cb && cb()
      return
    }

    var img = new Image()

    img.onload = function () {
      var c = document.createElement('canvas')

      // scale image to fit snugly inside of frame
      var scale = width / img.width
      if (img.height * scale > height) {
        scale = height / img.height
      }
      img.width *= scale
      img.height *= scale

      imgWidth = c.width = img.width
      imgHeight = c.height = img.height

      var ctx = c.getContext('2d')
      ctx.drawImage(img, 0, 0, imgWidth, imgHeight)
      // document.body.appendChild(c)
      var pixels = ctx.getImageData(0, 0, c.width, c.height).data
      debug && console.time('imageLoad')

      var blob = new Blob([$('#imageworker').text()], {
        type: "text/javascript"
      });
      var worker = new Worker(window.URL.createObjectURL(blob))

      worker.onmessage = function (e) {
        debug && console.timeEnd('imageLoad')

        if (buffer) {
          log('buffering', num)
          workerBuffer = imageBuffer
          imageBuffer = new Float32Array(e.data)
          imageBufferNum = num
        } else {
          workerBuffer = geometry.attributes.color.array
          geometry.attributes.color.array = new Float32Array(e.data)
        }

        // buffer next image
        !buffer && bufferImage(num + 1)

        cb && cb()
      };

      worker.postMessage({
        pixels: pixels.buffer,
        outputBuffer: workerBuffer.buffer,
        len: pixels.length
      }, [pixels.buffer, workerBuffer.buffer])

    }

    img.onerror = function (err) {
      console.error(err)
      alert('There was an unexpected error')
    }

    img.src = 'imgs/' + num + '.jpg'
  }

  /* **** Here is where the THREE code lives **** */

  // start the slideshow
  function start() {
    started = true
    drawLoading()
    width = $('#container-taz').width()
    height = $('#container-taz').height()

    $thumbnails[currentPic - 1].addClass('selected-taz')
    log('buffering verticies')
    bufferVerticies(getImageSize(), function () {
      log('loading first image')
      loadImage(currentPic, false, function () {

        // buffer next image in sequence
        bufferImage(currentPic + 1)
        clearOverlay()

        // create the rest of the THREE.js objects for rendering
        log('initializing slideshow')
        initSlideshow()

        // load the first image
        log('drawing first image')
        renderImage()

        // render the scene to screen
        log('rendering scene')
        render()

        // attatch listeners
        attachListeners()
      })

    })
  }

  // generate all of the verticies needed for the mesh 1:1 pixel:vertex ratio
  function bufferVerticies(imgSize, cb) {

    // BufferGeometry is MUCH more memory efficient
    // It also allows more efficient web worker usage
    geometry = new THREE.BufferGeometry()
    geometry.dynamic = true
    console.time('bufferVertex')
    var imgWidth = imgSize.width
    var imgHeight = imgSize.height
    var num = imgWidth * imgHeight * 3
    imageBuffer = new Float32Array(num)
    workerBuffer = new Float32Array(num)

    // Load an embedded web worker to do the heavy lifting
    var blob = new Blob([$('#vertexworker').text()], {
      type: "text/javascript"
    });
    var worker = new Worker(window.URL.createObjectURL(blob))

    worker.onmessage = function (e) {
      geometry.attributes.position = {
        itemSize: 3,
        array: new Float32Array(e.data),
        numItems: num
      }
      geometry.attributes.color = {
        itemSize: 3,
        array: new Float32Array(num),
        numItems: num
      }
      cb()
    };
    worker.postMessage({
      w: imgWidth,
      h: imgHeight,
      num: num
    })
  }

  function initSlideshow() {

    container = document.getElementById('container-taz')
    camera = new THREE.PerspectiveCamera(90, width / height, 1, 100000)

    // position camera for a 1:1 pixel unit ratio
    var vFOV = camera.fov * (Math.PI / 180) // convert VERTICAL fov to radians
    var targetZ = height / (2 * Math.tan(vFOV / 2))

    // add 2 to fix artifacts
    camera.position.z = targetZ + 2
    // fixed artifacting on high-res displays, but causes zoom-out
    camera.position.z *= window.devicePixelRatio

    scene = new THREE.Scene()

    uniforms = {

      // This dictates the point of the animation sequence
      amplitude: {
        type: 'f',
        value: 0
      },

      // Dictates the transition animation. Ranges from 0-9
      transition: {
        type: 'i',
        value: 0
      },

      // Boolean for transition animation changes to deal with higher density
      // 0 or 1
      fullscreen: {
        type: 'i',
        value: 0
      }
    }

    // Load custom shaders
    var vShader = $('#vertexshader')
    var fShader = $('#fragmentshader')

    material = new THREE.ShaderMaterial({
      uniforms: uniforms,
      vertexShader: vShader.text(),
      fragmentShader: fShader.text(),
      vertexColors: true,
      depthTest: false,
      transparent: true
    })

    particles = new THREE.ParticleSystem(geometry, material)

    scene.add(particles)

    renderer = new THREE.WebGLRenderer()
    renderer.setClearColor(0x000000)
    renderer.setSize(width, height)
    container.appendChild(renderer.domElement)

    log('finished initializing')
  }

  // cb is called halfway through the animation (used to swap image buffers)
  function animate(cb) {
    log('animating')
    var isFullScreen = document.fullscreen || document.webkitIsFullScreen || document.mozFullScreen
    var zoomConstant = isFullScreen ? 15 : 5
    uniforms.fullscreen.value = isFullScreen ? 1 : 0

      // Animation is temporary, so a closure is used and returned from
      function animLoop() {
        if (uniforms.amplitude.value === 1) {
          cb()
        }

        // update the frame counter
        frame += Math.PI * 0.02;

        // dynamic camera zoom during animation
        var zDelta = (zoom + 1 % 50) - 25
        if (zDelta <= 0) {
          zDelta -= 1
        }

        // Zoom is relative based on fullscreen state due to particle density
        camera.position.z -= zDelta * zoomConstant
        camera.updateProjectionMatriz = true
        render()
        zoom = (zoom + 1) % 50

        if (uniforms.amplitude.value <= 0.001) {
          log('animation ended, calling end callback')

          // Animate sidebar
          animationEndCallbacks[1](function () {

            // Buffer next image
            animationEndCallbacks[0](function () {

              // All events are toggled back on to allow for next transition
              ready = true
              log('ready')
            })
          })
          return
        }

        requestAnimFrame(animLoop)
      }

    animLoop()
  }

  function render() {

    // update the amplitude based on the frame
    uniforms.amplitude.value = Math.abs(Math.sin(frame))
    renderer.render(scene, camera)
  }
})()
