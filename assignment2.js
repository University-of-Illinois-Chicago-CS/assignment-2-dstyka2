import vertexShaderSrc from './vertex.glsl.js';
import fragmentShaderSrc from './fragment.glsl.js'

var gl = null;
var vao = null;
var program = null;
var vertexCount = 0;
var uniformModelViewLoc = null;
var uniformProjectionLoc = null;
var heightmapData = null;
var imageArray;
var arraySize;
var deltaX = 0;
var deltaY = 0;
var scrollVal = 50;
var rightX = 0;
var rightY = 0;

function processImage(img)
{
	// draw the image into an off-screen canvas
	var off = document.createElement('canvas');
	
	var sw = img.width, sh = img.height;
	off.width = sw; off.height = sh;
	
	var ctx = off.getContext('2d');
	ctx.drawImage(img, 0, 0, sw, sh);
	
	// read back the image pixel data
	var imgd = ctx.getImageData(0,0,sw,sh);
	var px = imgd.data;
	
	// create a an array will hold the height value
	var heightArray = new Float32Array(sw * sh);
	
	// loop through the image, rows then columns
	for (var y=0;y<sh;y++) 
	{
		for (var x=0;x<sw;x++) 
		{
			// offset in the image buffer
			var i = (y*sw + x)*4;
			
			// read the RGB pixel value
			var r = px[i+0], g = px[i+1], b = px[i+2];
			
			// convert to greyscale value between 0 and 1
			var lum = (0.2126*r + 0.7152*g + 0.0722*b) / 255.0;

			// store in array
			heightArray[y*sw + x] = lum;
		}
	}

	return {
		data: heightArray,
		width: sw,
		height: sw
	};
}


window.loadImageFile = function(event)
{
	var f = event.target.files && event.target.files[0];
	if (!f) return;
	//console.log("File reading started");
	// create a FileReader to read the image file
	var reader = new FileReader();
	reader.onload = function() 
	{
		// create an internal Image object to hold the image into memory
		var img = new Image();
		img.onload = function() 
		{
			// heightmapData is globally defined
			heightmapData = processImage(img);
			
			/*
				TODO: using the data in heightmapData, create a triangle mesh
					heightmapData.data: array holding the actual data, note that 
					this is a single dimensional array the stores 2D data in row-major order

					heightmapData.width: width of map (number of columns)
					heightmapData.height: height of the map (number of rows)
			*/
			//parse heightmapData (it only contains the brighness value for each point) into an array of triangles (3 points with 3 directions (XYZ) each), parse brightness as Y coordinate
			// use pattern of P1, P3, P2, P2, P3, P4 for each triangle pair (counterclockwise), repeat for rest of row and for all rows
			var tempWidth = heightmapData.width;
			var tempHeight = heightmapData.height;
			var incrementValue;
			var vIncrementValue;
			var newI;
			var newJ;
			imageArray = [];
			console.log("tempWidth: " +tempWidth+" tempHeight: " +tempHeight + " incrementValue: " +incrementValue + " vIncrementValue: " +vIncrementValue);
			for(var j = 0; j < tempHeight-1; j++){
				for(var i = 0; i < tempWidth-1; i++){ //for each set of 4 points, add to array 2 triangles ((P1, P3, P2), (P2, P3, P4)) with each of the points being in the format of (X, height, Z)
					newI = ((i/tempWidth)*2)-1;
					newJ = ((j/tempHeight)*2)-1;
					incrementValue = (((i+1)/tempWidth)*2)-1;
					vIncrementValue = (((j+1)/tempHeight)*2)-1;
					imageArray.push(newI, heightmapData.data[(i + j*tempWidth)], newJ); //triangle 1 P1
					imageArray.push(newI, heightmapData.data[(i + (j+1)*tempWidth)], vIncrementValue); //triangle 1 P3
					imageArray.push(incrementValue, heightmapData.data[((i+1) + j*tempWidth)], newJ); //triangle 1 P2
					imageArray.push(incrementValue, heightmapData.data[((i+1) + j*tempWidth)], newJ); //triangle 2 P2
					imageArray.push(newI, heightmapData.data[(i + (j+1)*tempWidth)], vIncrementValue); //triangle 2 P3
					imageArray.push(incrementValue, heightmapData.data[((i+1) + (j+1)*tempWidth)], vIncrementValue); //triangle 2 P4
				}
			}
			arraySize = imageArray.length;
			console.log('loaded image: ' + heightmapData.width + ' x ' + heightmapData.height);
			initialize();

		};
		img.onerror = function() 
		{
			console.error("Invalid image file.");
			alert("The selected file could not be loaded as an image.");
		};

		// the source of the image is the data load from the file
		img.src = reader.result;
	};
	reader.readAsDataURL(f);
}


function setupViewMatrix(eye, target)
{
    var forward = normalize(subtract(target, eye));
    var upHint  = [0, 1, 0];

    var right = normalize(cross(forward, upHint));
    var up    = cross(right, forward);

    var view = lookAt(eye, target, up);
    return view;

}
function draw()
{

	var fovRadians = 70 * Math.PI / 180;
	var aspectRatio = +gl.canvas.width / +gl.canvas.height;
	var nearClip = 0.001;
	var farClip = 20.0;

	var projectionMatrix;
	if (document.querySelector("#projection").value == 'perspective'){
		// perspective projection
		var projectionMatrix = perspectiveMatrix(
			fovRadians,
			aspectRatio,
			nearClip,
			farClip,
		);
	}
	else{
		projectionMatrix = orthographicMatrix(-4*aspectRatio, 4*aspectRatio, -4, 4, nearClip, farClip);
	}

	// eye and target
	var targetVal = scrollVal/10; //slow down the speed of scrolling
	var panValX = rightX/10; //show down the speed of moving the panning
	var panValZ = rightY/10;
	var eye = [panValX, targetVal, targetVal + panValZ]; //accomplish zooming by moving just the target, accomplish panning by moving both the eye and the target simultaneously 
	var target = [panValX, 0, panValZ];

	var heightInput = (parseInt(document.querySelector("#height").value)/25); //grab the height scale input and scale it to be smaller
	// TODO: set up transformations to the model
	var rotatedXMatrix = rotateXMatrix(-deltaY/50); //find rotation matrixies of X and Y seperatly
	var rotatedYMatrix = rotateYMatrix(-deltaX/50);
	var rotatedXYMatrix = multiplyMatrices(rotatedXMatrix,rotatedYMatrix); //multiply the rotated matrixies together to find the full rotation of the object
	var modelMatrix = multiplyMatrices(rotatedXYMatrix,scaleMatrix(2,heightInput,2)); //scale X and Z statically, scale Y ising the height slider

	// setup viewing matrix
	var viewMatrix = setupViewMatrix(eye, target);

	// model-view Matrix = view * model
	var modelviewMatrix = multiplyMatrices(viewMatrix, modelMatrix);


	// enable depth testing
	gl.enable(gl.DEPTH_TEST);

	// disable face culling to render both sides of the triangles
	gl.disable(gl.CULL_FACE);

	gl.clearColor(0.2, 0.2, 0.2, 1);
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

	gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
	gl.useProgram(program);
	
	// update modelview and projection matrices to GPU as uniforms
	gl.uniformMatrix4fv(uniformModelViewLoc, false, new Float32Array(modelviewMatrix));
	gl.uniformMatrix4fv(uniformProjectionLoc, false, new Float32Array(projectionMatrix));

	gl.bindVertexArray(vao);
	
	if(document.querySelector("#isWireframe").checked){ //check the status of the wireframe checkbox, apply wireframe to model if checked
		var primitiveType = gl.LINES;
	}
	else{
		var primitiveType = gl.TRIANGLES;
	}
	gl.drawArrays(primitiveType, 0, vertexCount);

	requestAnimationFrame(draw);

}

function createBox()
{
	function transformTriangle(triangle, matrix) {
		var v1 = [triangle[0], triangle[1], triangle[2], 1];
		var v2 = [triangle[3], triangle[4], triangle[5], 1];
		var v3 = [triangle[6], triangle[7], triangle[8], 1];

		var newV1 = multiplyMatrixVector(matrix, v1);
		var newV2 = multiplyMatrixVector(matrix, v2);
		var newV3 = multiplyMatrixVector(matrix, v3);

		return [
			newV1[0], newV1[1], newV1[2],
			newV2[0], newV2[1], newV2[2],
			newV3[0], newV3[1], newV3[2]
		];
	}

	var box = [];

	var triangle1 = [
		-1, -1, +1,
		-1, +1, +1,
		+1, -1, +1,
	];
	box.push(...triangle1)

	var triangle2 = [
		+1, -1, +1,
		-1, +1, +1,
		+1, +1, +1
	];
	box.push(...triangle2);

	// 3 rotations of the above face
	for (var i=1; i<=3; i++) 
	{
		var yAngle = i* (90 * Math.PI / 180);
		var yRotMat = rotateYMatrix(yAngle);

		var newT1 = transformTriangle(triangle1, yRotMat);
		var newT2 = transformTriangle(triangle2, yRotMat);

		box.push(...newT1);
		box.push(...newT2);
	}

	// a rotation to provide the base of the box
	var xRotMat = rotateXMatrix(90 * Math.PI / 180);
	box.push(...transformTriangle(triangle1, xRotMat));
	box.push(...transformTriangle(triangle2, xRotMat));


	return {
		positions: box
	};

}

var isDragging = false;
var startX, startY;
var leftMouse = false;

function addMouseCallback(canvas)
{
	isDragging = false;

	canvas.addEventListener("mousedown", function (e) 
	{
		if (e.button === 0) {
			console.log("Left button pressed");
			leftMouse = true;
		} else if (e.button === 2) {
			console.log("Right button pressed");
			leftMouse = false;
		}

		isDragging = true;
		startX = e.offsetX;
		startY = e.offsetY;
	});

	canvas.addEventListener("contextmenu", function(e)  {
		e.preventDefault(); // disables the default right-click menu
	});


	canvas.addEventListener("wheel", function(e)  {
		e.preventDefault(); // prevents page scroll

		if (e.deltaY < 0) 
		{
			console.log("Scrolled up"); //cap zoom input range to 10-100
			// e.g., zoom in
			if(scrollVal > 10){
				scrollVal -= 1;
			}
		} else {
			console.log("Scrolled down");
			// e.g., zoom out
			if(scrollVal < 100){
				scrollVal += 1;
			}
		}
	});

	document.addEventListener("mousemove", function (e) {
		if (!isDragging) return;
		var currentX = e.offsetX;
		var currentY = e.offsetY;

		if(leftMouse == true){ //differentiate which set of X and Y global variables to send the X and Y location data from the mouse based on which click is used
			deltaX = currentX - startX;
			deltaY = currentY - startY;
		}
		else{
			rightX = currentX - startX;
			rightY = currentY - startY;
			console.log('mouse drag by: ' +rightX);
		}
		console.log('mouse drag by: ' + deltaX + ', ' + deltaY);

		// implement dragging logic
	});

	document.addEventListener("mouseup", function () {
		isDragging = false;
	});

	document.addEventListener("mouseleave", () => {
		isDragging = false;
	});
}

function initialize() //only called upon file load, feeds the new vertex data into array buffer
{
	vertexCount = arraySize/3;		// vertexCount is global variable used by draw()

	// create buffers to put in box
	var meshVertices = new Float32Array(imageArray);
	var posBuffer = createBuffer(gl, gl.ARRAY_BUFFER, meshVertices);

	// attributes (per vertex)
	var posAttribLoc = gl.getAttribLocation(program, "position");

	vao = createVAO(gl, 
		// positions
		posAttribLoc, posBuffer, 

		// normals (unused in this assignments)
		null, null, 

		// colors (not needed--computed by shader)
		null, null
	);

	window.requestAnimationFrame(draw);
}

function initialize2() // initialises the box on startup of page, only called once in program
{
	var canvas = document.querySelector("#glcanvas");
	canvas.width = canvas.clientWidth;
	canvas.height = canvas.clientHeight;

	gl = canvas.getContext("webgl2");

	// add mouse callbacks
	addMouseCallback(canvas);

	var box = createBox();
	vertexCount = box.positions.length / 3;		// vertexCount is global variable used by draw()
	console.log(box);

	// create buffers to put in box
	var boxVertices = new Float32Array(box['positions']);
	var posBuffer = createBuffer(gl, gl.ARRAY_BUFFER, boxVertices);

	var vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSrc);
	var fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSrc);
	program = createProgram(gl, vertexShader, fragmentShader);

	// attributes (per vertex)
	var posAttribLoc = gl.getAttribLocation(program, "position");

	// uniforms
	uniformModelViewLoc = gl.getUniformLocation(program, 'modelview');
	uniformProjectionLoc = gl.getUniformLocation(program, 'projection');

	vao = createVAO(gl, 
		// positions
		posAttribLoc, posBuffer, 

		// normals (unused in this assignments)
		null, null, 

		// colors (not needed--computed by shader)
		null, null
	);

	window.requestAnimationFrame(draw);
}

window.onload = initialize2();