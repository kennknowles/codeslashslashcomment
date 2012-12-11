
Dynamic Image Distortion in the Browser with HTML5 Canvas (UI via KineticJS and Knockout)
========================================================================================

HTML5 Canvas is a raw drawing interface, supporting images and many shapes directly,
but also giving direct access to pixel manipulations. One such manipulation that
I have wanted to use is distorting an image based on control points. I'll show a
basic demo of how to do this by essentially doing "texture mapping" from one
HTML5 Canvas to another.

If you want to immediately see the UI in action,
[go look at it right here](http://kennknowles.github.com/codeslashslashcomment/2012-12-11-HTML5-Canvas-Image-Distortion/). (I cannot use
Javascript or iframes directly due to wordpress.com limitations)

For the demo, I put together an extremely minimal HTML scaffolding, and use KineticJS
to attach the canvas components.

```html
<html>
  <head>
    <style>
      #mapping-demo { display: box; display: -ms-box; display: -webkit-box; display: -moz-box; }
      #mapping-demo div { -webkit-box-flex: 0; -moz-box-flex: 0; -ms-box-flex: 0; }
      .canvas { border: 1px solid black; }
    </style>

    <script src="vendor/underscore-min.js" type="application/javascript"></script>
    <script src="vendor/jquery.min.js" type="application/javascript"></script>
    <script src="vendor/kinetic-v4.1.2.js" type="application/javascript"></script>

    <script src="texture-mapping.js" type="application/javascript"></script>
  </head>
  <body>
    <div id="mapping-demo">
      <div class="canvas" id="input-container"></div>
      <div>== maps to ==></div>
      <div class="canvas" id="output-container"></div>
    </div>
  </body>
</html>

Note that for security reasons all the Javascript and images involved must
be hosted from the same origin. To try this at home (at lesat in Chrome) you 
may need to run a little HTTP server. To make this easy for you, just run
this in a directory containing the example code:

    python -m SimpleHTTPServer 

...

Further reading on HTML5 Canvas and KineticJS

 * [HTML5 Canvas Cheet Sheat](http://blog.nihilogic.dk/2009/02/html5-canvas-cheat-sheet.html)
 * [KineticJS]()

Further reading on texture mapping and image warping:

 * [Texture Mapping with Barycentric coordinates](http://www.cescg.org/CESCG97/olearnik/txmap.htm)
 * [Image Deformation Using Moving Least Squares](http://faculty.cs.tamu.edu/schaefer/research/mls.pdf)
 * [Image Warping with Scattered Data Interpolation Methods (1992)](http://citeseerx.ist.psu.edu/viewdoc/summary?doi=10.1.1.27.1290)
 * [Texture Mapping Mania](http://www.gamedev.net/page/resources/_/technical/graphics-programming-and-theory/texture-mapping-mania-r852)

And further reading on Barycentric coordinates:

 * [Barycenters](http://adrianboeing.blogspot.com/2010/01/barycentric-coordinates.html)
 * [Barycenters](http://en.wikipedia.org/wiki/Barycentric_coordinate_system_(mathematics))
 * [Barycenters](http://gamedev.stackexchange.com/questions/23743/whats-the-most-efficient-way-to-find-barycentric-coordinates)
 * [Barycenters](http://www.cut-the-knot.org/triangle/glasses.shtml)
 * [Barycentrics](http://facultyfp.salisbury.edu/despickler/personal/Resources/Graphics/Resources/barycentric.pdf)
