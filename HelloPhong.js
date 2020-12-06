

// WebGL context, canvas and shaderprogram objects
var gl;
var canvas;
var shaderProgram;

// Create a place to store sphere geometry
var sphereVertexPositionBuffer;

//Create a place to store normals for shading
var sphereVertexNormalBuffer;

// View parameters
var eyePt = glMatrix.vec3.fromValues(0.0,0.0,40.0);
var viewDir = glMatrix.vec3.fromValues(0.0,0.0,-1.0);
var up = glMatrix.vec3.fromValues(0.0,1.0,0.0);
var viewPt = glMatrix.vec3.fromValues(0.0,0.0,0.0);

// Create the normal
var nMatrix = glMatrix.mat3.create();

// Create ModelView matrix
var mvMatrix = glMatrix.mat4.create();

var sphMatrix = glMatrix.mat4.create();

//Create Projection matrix
var pMatrix = glMatrix.mat4.create();

var mvMatrixStack = [];

var currentlyPressedKeys = {};

var particles = [];

// Light parameters

//light position
var lightx=20.0;
var lighty=20.0;
var lightz=20.0;
var numSpheres = 1;

//light intensity
var alight = 0.0;
var dlight = 1.0;
var slight = 1.0;

//-----------------------------------------------------------------
//Color conversion  helper functions
function hexToR(h) {return parseInt((cutHex(h)).substring(0,2),16)}
function hexToG(h) {return parseInt((cutHex(h)).substring(2,4),16)}
function hexToB(h) {return parseInt((cutHex(h)).substring(4,6),16)}
function cutHex(h) {return (h.charAt(0)=="#") ? h.substring(1,7):h}


//-------------------------------------------------------------------------
/**
 * Populates buffers with data for spheres
 */
function setupSphereBuffers() {

    var sphereSoup=[];
    var sphereNormals=[];
    var numT=sphereFromSubdivision(6,sphereSoup,sphereNormals);
    console.log("Generated ", numT, " triangles");
    sphereVertexPositionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, sphereVertexPositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(sphereSoup), gl.STATIC_DRAW);
    sphereVertexPositionBuffer.itemSize = 3;
    sphereVertexPositionBuffer.numItems = numT*3;
    console.log(sphereSoup.length/9);

    // Specify normals to be able to do lighting calculations
    sphereVertexNormalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, sphereVertexNormalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(sphereNormals),
                  gl.STATIC_DRAW);
    sphereVertexNormalBuffer.itemSize = 3;
    sphereVertexNormalBuffer.numItems = numT*3;

    console.log("Normals ", sphereNormals.length/3);
}

//-------------------------------------------------------------------------
/**
 * Draws a sphere from the sphere buffer
 */
function drawSphere(){
 gl.bindBuffer(gl.ARRAY_BUFFER, sphereVertexPositionBuffer);
 gl.vertexAttribPointer(shaderProgram.vertexPositionAttribute, sphereVertexPositionBuffer.itemSize,
                         gl.FLOAT, false, 0, 0);

 // Bind normal buffer
 gl.bindBuffer(gl.ARRAY_BUFFER, sphereVertexNormalBuffer);
 gl.vertexAttribPointer(shaderProgram.vertexNormalAttribute,
                           sphereVertexNormalBuffer.itemSize,
                           gl.FLOAT, false, 0, 0);
 gl.drawArrays(gl.TRIANGLES, 0, sphereVertexPositionBuffer.numItems);
}

//-------------------------------------------------------------------------
/**
 * Sends Modelview matrix to shader
 */
function uploadModelViewMatrixToShader() {
  gl.uniformMatrix4fv(shaderProgram.mvMatrixUniform, false, mvMatrix);
  gl.uniformMatrix4fv(shaderProgram.sphMatrixUniform, false, sphMatrix);
}

//-------------------------------------------------------------------------
/**
 * Sends projection matrix to shader
 */
function uploadProjectionMatrixToShader() {
  gl.uniformMatrix4fv(shaderProgram.pMatrixUniform,
                      false, pMatrix);
}

//-------------------------------------------------------------------------
/**
 * Generates and sends the normal matrix to the shader
 */
function uploadNormalMatrixToShader() {
  glMatrix.mat3.fromMat4(nMatrix,mvMatrix);
  glMatrix.mat3.transpose(nMatrix,nMatrix);
  glMatrix.mat3.invert(nMatrix,nMatrix);
  gl.uniformMatrix3fv(shaderProgram.nMatrixUniform, false, nMatrix);
}

//----------------------------------------------------------------------------------
/**
 * Pushes matrix onto modelview matrix stack
 */
function mvPushMatrix() {
    var copy = glMatrix.mat4.clone(mvMatrix);
    mvMatrixStack.push(copy);
}


//----------------------------------------------------------------------------------
/**
 * Pops matrix off of modelview matrix stack
 */
function mvPopMatrix() {
    if (mvMatrixStack.length == 0) {
      throw "Invalid popMatrix!";
    }
    mvMatrix = mvMatrixStack.pop();
}

//----------------------------------------------------------------------------------
/**
 * Sends projection/modelview matrices to shader
 */
function setMatrixUniforms() {
    uploadModelViewMatrixToShader();
    uploadNormalMatrixToShader();
    uploadProjectionMatrixToShader();
}

//----------------------------------------------------------------------------------
/**
 * Translates degrees to radians
 * @param {Number} degrees Degree input to function
 * @return {Number} The radians that correspond to the degree input
 */
function degToRad(degrees) {
        return degrees * Math.PI / 180;
}

//----------------------------------------------------------------------------------
/**
 * Creates a context for WebGL
 * @param {element} canvas WebGL canvas
 * @return {Object} WebGL context
 */
function createGLContext(canvas) {
  var names = ["webgl", "experimental-webgl"];
  var context = null;
  for (var i=0; i < names.length; i++) {
    try {
      context = canvas.getContext(names[i]);
    } catch(e) {}
    if (context) {
      break;
    }
  }
  if (context) {
    context.viewportWidth = canvas.width;
    context.viewportHeight = canvas.height;
  } else {
    alert("Failed to create WebGL context!");
  }
  return context;
}

//----------------------------------------------------------------------------------
/**
 * Loads Shaders
 * @param {string} id ID string for shader to load. Either vertex shader/fragment shader
 */
function loadShaderFromDOM(id) {
  var shaderScript = document.getElementById(id);

  // If we don't find an element with the specified id
  // we do an early exit
  if (!shaderScript) {
    return null;
  }

  // Loop through the children for the found DOM element and
  // build up the shader source code as a string
  var shaderSource = "";
  var currentChild = shaderScript.firstChild;
  while (currentChild) {
    if (currentChild.nodeType == 3) { // 3 corresponds to TEXT_NODE
      shaderSource += currentChild.textContent;
    }
    currentChild = currentChild.nextSibling;
  }

  var shader;
  if (shaderScript.type == "x-shader/x-fragment") {
    shader = gl.createShader(gl.FRAGMENT_SHADER);
  } else if (shaderScript.type == "x-shader/x-vertex") {
    shader = gl.createShader(gl.VERTEX_SHADER);
  } else {
    return null;
  }

  gl.shaderSource(shader, shaderSource);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert(gl.getShaderInfoLog(shader));
    return null;
  }
  return shader;
}

//----------------------------------------------------------------------------------
/**
 * Setup the fragment and vertex shaders
 */
function setupShaders(vshader,fshader) {
  vertexShader = loadShaderFromDOM(vshader);
  fragmentShader = loadShaderFromDOM(fshader);

  shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);

  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    alert("Failed to setup shaders");
  }

  gl.useProgram(shaderProgram);

  shaderProgram.vertexPositionAttribute = gl.getAttribLocation(shaderProgram, "aVertexPosition");
  gl.enableVertexAttribArray(shaderProgram.vertexPositionAttribute);

  shaderProgram.vertexNormalAttribute = gl.getAttribLocation(shaderProgram, "aVertexNormal");
  gl.enableVertexAttribArray(shaderProgram.vertexNormalAttribute);

  shaderProgram.mvMatrixUniform = gl.getUniformLocation(shaderProgram, "uMVMatrix");
  shaderProgram.sphMatrixUniform = gl.getUniformLocation(shaderProgram, "uSPHMatrix");
  shaderProgram.pMatrixUniform = gl.getUniformLocation(shaderProgram, "uPMatrix");
  shaderProgram.nMatrixUniform = gl.getUniformLocation(shaderProgram, "uNMatrix");
  shaderProgram.uniformLightPositionLoc = gl.getUniformLocation(shaderProgram, "uLightPosition");
  shaderProgram.uniformAmbientLightColorLoc = gl.getUniformLocation(shaderProgram, "uAmbientLightColor");
  shaderProgram.uniformDiffuseLightColorLoc = gl.getUniformLocation(shaderProgram, "uDiffuseLightColor");
  shaderProgram.uniformSpecularLightColorLoc = gl.getUniformLocation(shaderProgram, "uSpecularLightColor");
  shaderProgram.uniformDiffuseMaterialColor = gl.getUniformLocation(shaderProgram, "uDiffuseMaterialColor");
  shaderProgram.uniformAmbientMaterialColor = gl.getUniformLocation(shaderProgram, "uAmbientMaterialColor");
  shaderProgram.uniformSpecularMaterialColor = gl.getUniformLocation(shaderProgram, "uSpecularMaterialColor");

  shaderProgram.uniformShininess = gl.getUniformLocation(shaderProgram, "uShininess");
}


//-------------------------------------------------------------------------
/**
 * Sends material information to the shader
 * @param {Float32Array} a diffuse material color
 * @param {Float32Array} a ambient material color
 * @param {Float32Array} a specular material color
 * @param {Float32} the shininess exponent for Phong illumination
 */
function uploadMaterialToShader(dcolor, acolor, scolor,shiny) {
  gl.uniform3fv(shaderProgram.uniformDiffuseMaterialColor, dcolor);
  gl.uniform3fv(shaderProgram.uniformAmbientMaterialColor, acolor);
  gl.uniform3fv(shaderProgram.uniformSpecularMaterialColor, scolor);

  gl.uniform1f(shaderProgram.uniformShininess, shiny);
}

//-------------------------------------------------------------------------
/**
 * Sends light information to the shader
 * @param {Float32Array} loc Location of light source
 * @param {Float32Array} a Ambient light strength
 * @param {Float32Array} d Diffuse light strength
 * @param {Float32Array} s Specular light strength
 */
function uploadLightsToShader(loc,a,d,s) {
  gl.uniform3fv(shaderProgram.uniformLightPositionLoc, loc);
  gl.uniform3fv(shaderProgram.uniformAmbientLightColorLoc, a);
  gl.uniform3fv(shaderProgram.uniformDiffuseLightColorLoc, d);
  gl.uniform3fv(shaderProgram.uniformSpecularLightColorLoc, s);
}

//----------------------------------------------------------------------------------
/**
 * Populate buffers with data
 */
function setupBuffers() {
    setupSphereBuffers();
}

//-------------------------------------------------------------------------
/**
 * Press down
 */
function handleKeyDown(event) {
  console.log("Key down", event.key, " code ", event.code);
  if (event.key == "ArrowUp" || event.key == "ArrowDown" || event.key == "ArrowLeft" || event.key == "ArrowRight")
  {
  event.preventDefault();
  }
  currentlyPressedKeys[event.key] = true;
  if (currentlyPressedKeys["ArrowUp"] && particles.length < 50)
  {
    manySpheres(numSpheres);
  }
  else if (currentlyPressedKeys["ArrowDown"])
  {
    clearSpheres();
  }
}

//-------------------------------------------------------------------------
/**
 * Release key
 */
function handleKeyUp(event) {
        currentlyPressedKeys[event.key] = false;
}

//----------------------------------------------------------------------------------
/**
 * Set up buffer that fills in position, size, color, and velocity of spheres
 */
function manySpheres(numSpheres) {
  var positionX;
  var positionY;
  var positionZ;
  var position = [];
  var size;
  var velocity = glMatrix.vec3.create();
  var color = [];
  var currParticle = [];
  for (var i = 0; i < numSpheres; i++)
  {
    positionX = (Math.random() * 6) - 3;
    positionY = (Math.random() * 6) - 3;
    positionZ = (Math.random() * 6) - 3;
    position = [positionX, positionY, 0];
    size = Math.random() + 0.75;
    color = [Math.floor(Math.random() * 255), Math.floor(Math.random() * 255), Math.floor(Math.random() * 255)];
    velocity = [(Math.random() * 2) - 1, (Math.random() * 2) - 1, 0];
    glMatrix.vec3.normalize(velocity, velocity);
    currParticle = [position, size, velocity, color];
    particles.push(currParticle);
  }
}

//----------------------------------------------------------------------------------
/**
 * Clear all the spheres
 */
function clearSpheres() {
  while (particles.length != 0)
  {
    particles.pop();
  }
}

//----------------------------------------------------------------------------------
/**
 * Set up buffer that fills in position, size, color, and velocity of spheres
 */
function collisionDetect(i, currPos, r) {
  var currSphere = particles[i];
  var currPosX = currSphere[0][0];
  var currPosY = currSphere[0][1];
  var normalVector = glMatrix.vec3.create();
  var incidentVector = glMatrix.vec3.create();
  incidentVector = particles[i][2];
  var reflectVector = glMatrix.vec3.create();
  var temp = glMatrix.vec3.create();
  if(currPosX + r >= 5) //collision with x=1 plane
  {
    normalVector = [-1,0,0];
    glMatrix.vec3.dot(reflectVector, incidentVector, normalVector);
    glMatrix.vec3.scale(temp, normalVector, 2);
    glMatrix.vec3.mul(reflectVector, reflectVector, temp);
    glMatrix.vec3.sub(reflectVector, incidentVector, reflectVector);
    glMatrix.vec3.normalize(reflectVector, reflectVector);
    glMatrix.vec3.scale(reflectVector, reflectVector, 0.05);
    particles[i][2] = reflectVector;
    glMatrix.vec3.add(particles[i][0], currPos, reflectVector);
  }
  else {
    glMatrix.vec3.normalize(incidentVector, incidentVector);
    glMatrix.vec3.scale(incidentVector, incidentVector, 0.05);
    glMatrix.vec3.add(particles[i][0], currPos, incidentVector);
  }
  if(currPosX - r <= -5) //collision with x=-1 plane
  {
    normalVector = [1,0,0];
    glMatrix.vec3.dot(reflectVector, incidentVector, normalVector);
    glMatrix.vec3.scale(temp, normalVector, 2);
    glMatrix.vec3.mul(reflectVector, reflectVector, temp);
    glMatrix.vec3.sub(reflectVector, incidentVector, reflectVector);
    glMatrix.vec3.normalize(reflectVector, reflectVector);
    glMatrix.vec3.scale(reflectVector, reflectVector, 0.05);
    particles[i][2] = reflectVector;
    glMatrix.vec3.add(particles[i][0], currPos, reflectVector);
  }
  else {
    glMatrix.vec3.normalize(incidentVector, incidentVector);
    glMatrix.vec3.scale(incidentVector, incidentVector, 0.05);
    glMatrix.vec3.add(particles[i][0], currPos, incidentVector);
  }
  if(currPosY + r >= 5) //collision with y=1 plane
  {
    normalVector = [0,-1,0];
    glMatrix.vec3.dot(reflectVector, incidentVector, normalVector);
    glMatrix.vec3.scale(temp, normalVector, 2);
    glMatrix.vec3.mul(reflectVector, reflectVector, temp);
    glMatrix.vec3.sub(reflectVector, incidentVector, reflectVector);
    glMatrix.vec3.normalize(reflectVector, reflectVector);
    glMatrix.vec3.scale(reflectVector, reflectVector, 0.05);
    particles[i][2] = reflectVector;
    glMatrix.vec3.add(particles[i][0], currPos, reflectVector);
  }
  else {
    glMatrix.vec3.normalize(incidentVector, incidentVector);
    glMatrix.vec3.scale(incidentVector, incidentVector, 0.05);
    glMatrix.vec3.add(particles[i][0], currPos, incidentVector);
  }
  if(currPosY - r <= -5) //collision with y=-1 plane
  {
    normalVector = [0,1,0];
    glMatrix.vec3.dot(reflectVector, incidentVector, normalVector);
    glMatrix.vec3.scale(temp, normalVector, 2);
    glMatrix.vec3.mul(reflectVector, reflectVector, temp);
    glMatrix.vec3.sub(reflectVector, incidentVector, reflectVector);
    glMatrix.vec3.normalize(reflectVector, reflectVector);
    glMatrix.vec3.scale(reflectVector, reflectVector, 0.05);
    particles[i][2] = reflectVector;
    glMatrix.vec3.add(particles[i][0], currPos, reflectVector);
  }
  else {
    glMatrix.vec3.normalize(incidentVector, incidentVector);
    glMatrix.vec3.scale(incidentVector, incidentVector, 0.05);
    glMatrix.vec3.add(particles[i][0], currPos, incidentVector);
  }
}

//----------------------------------------------------------------------------------
/**
 * Draw call that applies matrix transformations to model and draws model in frame
 */
function draw() {
    var transformVec = glMatrix.vec3.create();

    gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // We'll use perspective
    glMatrix.mat4.perspective(pMatrix,degToRad(90), gl.viewportWidth / gl.viewportHeight, 0.1, 200.0);

    // We want to look down -z, so create a lookat point in that direction
    glMatrix.vec3.add(viewPt, eyePt, viewDir);
    // Then generate the lookat matrix and initialize the MV matrix to that view
    glMatrix.mat4.lookAt(mvMatrix,eyePt,viewPt,up);
    for (var i = 0; i < particles.length; i++)
    {
      collisionDetect(i, particles[i][0], particles[i][1]);
      var currParticle = particles[i];
      var currPos = currParticle[0];
      var currSize = currParticle[1];
      var currVeloc = currParticle[2];
      var currColor = currParticle[3];
      glMatrix.vec3.set(transformVec,currSize,currSize,currSize); //size of ball
      glMatrix.mat4.scale(sphMatrix, mvMatrix,transformVec); //scale ball
      glMatrix.mat4.translate(sphMatrix, sphMatrix, currPos); //location of ball

      //Get material color
      R = currColor[0]/255.0;
      G = currColor[1]/255.0;
      B = currColor[2]/255.0;

      //Get shiny
      shiny = 100;

      uploadLightsToShader([lightx,lighty,lightz],[alight,alight,alight],[dlight,dlight,dlight],[slight,slight,slight]);
      uploadMaterialToShader([R,G,B],[R,G,B],[1.0,1.0,1.0],shiny);
      setMatrixUniforms();
      drawSphere();
    }
}

//----------------------------------------------------------------------------------
/**
 * Animation to be called from tick. Updates globals and performs animation for each tick.
 */
function animate() {
  numSpheres = document.getElementById("sphereNum").value;
}

//----------------------------------------------------------------------------------
/**
 * Animation to be called from tick. Updates globals and performs animation for each tick.
 */
function setPhongShader() {
    console.log("Setting Phong shader");
    setupShaders("shader-phong-phong-vs","shader-phong-phong-fs");
}

//----------------------------------------------------------------------------------
/**
 * Animation to be called from tick. Updates globals and performs animation for each tick.
 */
function setGouraudShader() {
    console.log("Setting Gouraud Shader");
    setupShaders("shader-gouraud-phong-vs","shader-gouraud-phong-fs");
}


//----------------------------------------------------------------------------------
/**
 * Startup function called from html code to start program.
 */
 function startup() {
  canvas = document.getElementById("myGLCanvas");
  gl = createGLContext(canvas);
  setupShaders("shader-gouraud-phong-vs","shader-gouraud-phong-fs");
  setupBuffers();
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.enable(gl.DEPTH_TEST);
  manySpheres(1);
  document.onkeydown = handleKeyDown;
  document.onkeyup = handleKeyUp;
  tick();
}

//----------------------------------------------------------------------------------
/**
 * Tick called for every animation frame.
 */
function tick() {
    requestAnimFrame(tick);
    draw();
    animate();
}
