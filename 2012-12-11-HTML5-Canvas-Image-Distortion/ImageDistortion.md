

Note that for security reasons all the Javascript and images involved must
be hosted from the same origin. To try this at home (at lesat in Chrome) you 
may need to run a little HTTP server. To make this easy for you, just run
this in a directory containing the example code:

    python -m SimpleHTTPServer 

And now navigate to `localhost:8000` to view the demo.

This article has two parts: the set up for the input and the set up for
the output. The input set up is more of an tutorial for KineticJS
basics. The output is where the warping comes in.

So, let us begin writing the function `attach_input_stage`. A
_stage_ is what KineticJS calls a scenegraph, more-or-less. It
consists of a bunch of layers that can each contain various
shapes and mobile objects, etc. Pretty typical stuff, but
you should certainly read [How It Works]() on the KineticJS
wiki.

```
function attach_input_stage(options) {

}
```



So, the first thing that needs to happen is to attach a KineticJS
canvas to each of the `div`s set up for that purpose.



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
