
/*
Dynamic Image Distortion in the Browser with HTML5 Canvas (UI via KineticJS and Knockout)
========================================================================================

HTML5 Canvas is a raw drawing interface, supporting images and many shapes directly,
but also giving direct access to pixel manipulations. One such manipulation that
I have wanted to use is that of linearly warping an image based on control points. 
I'll show a basic demo of how to do this by essentially doing barycentrically-interpolated
"texture mapping" from one HTML5 Canvas to another.

If you want to immediately see the UI in action, 
[go look at it right here](http://kennknowles.github.com/codeslashslashcomment/2012-12-11-HTML5-Canvas-Image-Distortion/). 
(I cannot use Javascript or iframes directly due to wordpress.com limitations)

For the demo, I put together an extremely minimal HTML scaffolding, use [KineticJS](http://kineticjs.com/)
to attach the canvas components, and use [Knockout](http://knockoutjs.com/) for reactivity.

Note that for security reasons all the Javascript and images involved must
be hosted from the same origin, hence the `vendor` directory. To try this 
at home (at least in Chrome) you may need to run a little HTTP server. A very
simple one ships with Python, so just run this in any directory:

    python -m SimpleHTTPServer 

And now navigate to `localhost:8000` to view the demo.

This article has three parts: The input, the output, and the math.
The input is a basic combination of KineticJS and KnockoutJS,
the output gets into some raw HTML5 Canvas manipulation, and the
math appendix describes barycentric coordinates and texture
mapping a bit.

Input: A triangular viewport
----------------------------

I envision for a static triangular viewport with a movable
image. Those parts of the image in the viewport will be the "output"
of this control. The interface to this control will thus include
some image data - which is necessarily rectangular - and a triangle
within that image data that is selected for output. The image data
will be a KnockoutJS _observable_ that fires whenever the input image
moves.

```
{
   viewport_triangle: // Array of three points
   image_data: // Knockout observable of HTML5 ImageData object
}
```

And the parameters will be an image URL (must be same-origin),
a DOM element ID to attach to, the size that the canvas should be,
and the triangle defining the viewport. I'm not that excited 
about this design, but I don't want to think too hard about the 
best abstraction; this is just a demo! Here is a picture:

...

And I will step through the code

*/

function draggable_image_layer(image_url) {
    var image_layer = new Kinetic.Layer();
    
    // Since Knockout's reactivity is push-based, one
    // should be careful in production to check performance 
    // and selectively throttle "continuous" event sources
    // like a moving image. I won't bother now, though.
    image_layer.image_data = ko.observable();
    function update_image_data() {
        var canvas = image_layer.getCanvas();
        image_layer.image_data(canvas.getContext('2d').getImageData(0, 0, canvas.getWidth(), canvas.getHeight()));
    }

    var image = new Kinetic.Image({ draggable: true });
    image_layer.add(image);
    image.on("dragmove", update_image_data);

    var img = new Image(); // HTML <img> "tag" to load
    img.onload = function() {
        image.setImage(img);
        image_layer.draw();
        update_image_data();
    };
    img.src = image_url;

    return image_layer;
}

function triangular_viewport_control(named_parameters) {
    var self = {};

    // Required parameters passed in a dictionary for legibility of the client
    var container_id = named_parameters.container_id;
    var container_size = named_parameters.container_size;
    var image_url = named_parameters.image_url;
    var viewport_triangle = named_parameters.viewport_triangle;

    /* Attach to the DOM; start out with an image layer and a label layer */
    var stage = new Kinetic.Stage({ 
        container: container_id,
        width: container_size.width,
        height: container_size.height
    });
    var image_layer = draggable_image_layer(image_url);
    var label_layer = new Kinetic.Layer();
    stage.add(image_layer);
    stage.add(label_layer);

    /*
      On the label layer - separated so that its image data does not show up in the 
      image data output - I set up a nice outline of the triangle with labeled corners,
      and fade out portions of the `stage` that are not part of the output.
    */

    // Dimming the area outside the viewport
    label_layer.add(new Kinetic.Polygon({ 
        points: [{ x: 0, y: 0 },
                 { x: 0, y: container_size.height },
                 { x: container_size.width, y: container_size.height },
                 { x: container_size.width, y: 0 },
                 { x: 0, y: 0},
                 viewport_triangle[0],
                 viewport_triangle[2],
                 viewport_triangle[1],
                 viewport_triangle[0]],
        fill: 'white', strokeWidth: 0, opacity: 0.7,
        drawHitFunc: function() { }
    }));

    // Solid red outline
    label_layer.add(new Kinetic.Polygon({
        points: viewport_triangle,
        strokeWidth: 2, stroke: 'red',
        drawHitFunc: function() { }
    }));

    // Labeled corners
    _(viewport_triangle).each(function(point, idx) {
        var letter = String.fromCharCode('A'.charCodeAt(0) + idx);
        label_layer.add(circled_letter(letter, point, false));
    });

    label_layer.draw(); // Kick it for good measure

    return {
        // I didn't mention it but the first point had *better* be the top left and the last one bottom right :-)
        viewport_triangle: viewport_triangle,
        image_data: image_layer.image_data
    }
}

/*
  
Output: An interactively-warpable triangle
------------------------------------------

I want the output to have a triangled labeled in
accordance with the input, but for the labeled
corners of the triangle to be draggable, and then
for the distorted image to show up within that
triangle. I will also make the currently selected triangle
observable to the outside, so it can be taken as an
input. You could certainly decouple the control from the
image drawing, but no need for a demo.

*/

function warpable_triangle_control(named_parameters) {
    var self = {};

    var container_id = named_parameters.container_id;
    var container_size = named_parameters.container_size;
    var input_image_data = named_parameters.input_image_data;
    var input_triangle = _(named_parameters.input_triangle).map(p2v); // Most handy in vector form
    
    var stage = new Kinetic.Stage({ container: container_id, width: container_size.width, height: container_size.height });
    var control_layer = new Kinetic.Layer();
    var drawing_layer = new Kinetic.Layer();
    stage.add(drawing_layer);
    stage.add(control_layer);

    /*
      The circled letters for the corners in this case will be draggable, and I have
      made their positions into KnockoutJS observables.
    */
    var corners = _(input_triangle).map(function(xy, idx) {
        var letter = String.fromCharCode('A'.charCodeAt(0) + idx);
        var corner = circled_letter(letter, v2p(xy), true);
        return corner;
    });

    /*
      The warped triangle is a _computed_ observable.
     */
    self.warped_triangle = ko.computed(function() {
        return _(corners).map(function(corner) {
            return corner.position();
        });
    });

    /*
      But KineticJS is not really designed with functional reactivity in 
      mind, so I create one polygon and mutate its points according to the changing
      triangle. 
    */
    
    var outline = new Kinetic.Polygon({
        points: self.warped_triangle(),
        strokeWidth: 2, stroke: 'red',
        drawHitFunc: function() { }
    })
    ko.computed(function() { outline.setPoints(self.warped_triangle()) }); 
    control_layer.add(outline);
    _(corners).each(function(corner) { control_layer.add(corner); }); // Javascript fails at eta-contraction
    control_layer.draw(); // Kick
    
    /*
      Now we are ready to directly blit from the input image data into the
      appropriate place in the output data.  Since we want to do
      this essentially reactively, the whole mess is just one
      but KnockoutJS subscription.
      
      See the appendix on barycentric coords to get the math, but the essential
      thing is just scanning over all the output pixels, calculating their
      relationship with the warped triangle, and then copying over
      the appropriate input pixels.
     */
    
    var drawing_context = drawing_layer.getCanvas().getContext('2d');

    ko.computed(function() {
        var warped_triangle = _(self.warped_triangle()).map(p2v); // Get in vector form
        var current_image_data = input_image_data(); // Freeze the observable here
        if (!current_image_data) {
            console.log('Bailing out; image not loaded yet?');
            return;
        }
        var warped_image_data = drawing_context.getImageData(0, 0, drawing_context.canvas.width, drawing_context.canvas.height);

        map_triangle(current_image_data, input_triangle, warped_image_data, warped_triangle);
        drawing_context.putImageData(warped_image_data, 0, 0);
    });

    return self;
}

/*

*/

function map_triangle(src_image_data, src_triangle, dst_image_data, dst_triangle) {
    var src_pixel_data = src_image_data.data;
    var dst_pixel_data = dst_image_data.data;

    for(var x = 0; x < dst_image_data.width; x++) {
        for(var y = 0; y < dst_image_data.height; y++) {
            var uv = cartesian_to_barycentric(dst_triangle, [x, y]);
            
            // Did I forget to mention this other lovely aspect of barycentric coords?
            var xy_in_triangle = (uv[0] >= 0) && (uv[1] >= 0) && (uv[0] + uv[1] <= 1); 
            
            var dst_pixel_start = PIXEL_WIDTH * (x + y * dst_image_data.width); 
            
            if (xy_in_triangle) {
                src_xy = barycentric_to_cartesian(src_triangle, uv);
                src_pixel_start = PIXEL_WIDTH * (Math.floor(src_xy[0]) + Math.floor(src_xy[1]) * src_image_data.width);

                dst_pixel_data[dst_pixel_start]   = src_pixel_data[src_pixel_start];
                dst_pixel_data[dst_pixel_start+1] = src_pixel_data[src_pixel_start+1];
                dst_pixel_data[dst_pixel_start+2] = src_pixel_data[src_pixel_start+2];
                dst_pixel_data[dst_pixel_start+3] = src_pixel_data[src_pixel_start+3];
            } else {
                dst_pixel_data[dst_pixel_start] = 255;
                dst_pixel_data[dst_pixel_start+1] = 255;
                dst_pixel_data[dst_pixel_start+2] = 255;
                dst_pixel_data[dst_pixel_start+3] = 255;
            }
        }
    }
}


/*
 * Main Glue
 */

$(document).ready(function() {
    var input_control = triangular_viewport_control({ 
        container_id: 'input-container',
        container_size: { width: 400, height: 400 },
        image_url: 'picture.jpg',
        viewport_triangle: [
            { x: 100, y: 100 },
            { x: 100, y: 300 },
            { x: 300, y: 300 }
        ],
    });

    var warped_output = warpable_triangle_control({ 
        container_id: 'output-container',
        container_size: { width: 400, height: 400 },
        input_triangle: input_control.viewport_triangle,
        input_image_data: input_control.image_data,
    });
});


var PIXEL_WIDTH = 4;

/* 

Appendix A: Barycentric coordinates
-----------------------------------

The word _barycenter_ means "center of mass". For our purposes, we
can skip the huge world of awesome facts related to "barycentrism"
as it were, but here are teaser images to make you follow the
links below to further reading...


... but we can just focus on the great coordinate system the idea
gives us: We can express any point inside a triangle as a linear 
combination of the three corners. Why is this useful? We can 
re-apply those _same_ coordinates to the warped triangle and 
get a continuous (linear) mapping between them. Just what we 
need to map the pixels!

*/

// Vector math
function add(v0, v1) { return [v0[0] + v1[0], v0[1] + v1[1]]; }
function sub(v0, v1) { return [v0[0] - v1[0], v0[1] - v1[1]]; }
function dot(v0, v1) { return v0[0]*v1[0] + v0[1]*v1[1]; }
function mul(k, v) { return [k*v[0], k*v[1]]; }
function p2v(p) { return [p.x, p.y]; }
function v2p(v) { return {x: v[0], y: v[1]}; }

function cartesian_to_barycentric(triangle, xy) {
    var a = triangle[0];
    var b = triangle[1];
    var c = triangle[2];

    var v0 = sub(c, a);
    var v1 = sub(b, a);
    var v2 = sub(xy, a);

    // Compute dot products
    var dot00 = dot(v0, v0)
    var dot01 = dot(v0, v1)
    var dot02 = dot(v0, v2)
    var dot11 = dot(v1, v1)
    var dot12 = dot(v1, v2)

    // Compute barycentric coordinates
    var invDenom = 1 / (dot00 * dot11 - dot01 * dot01)
    var u = (dot11 * dot02 - dot01 * dot12) * invDenom
    var v = (dot00 * dot12 - dot01 * dot02) * invDenom

    return [u, v];

}

function barycentric_to_cartesian(triangle, uv) {
    var a = triangle[0];
    var ba = sub(triangle[1], a);
    var ca = sub(triangle[2], a);

    return add(a, add( mul(uv[0], ca), mul(uv[1], ba)));
}


/*
  Appendix B: `circled_letter`. Just groups together
  a circle and a letter and makes the position observable.
 */

function circled_letter(letter, position, draggable) {        
    var options = _({ draggable: draggable }).extend(draggable ? {} : { drawHitFunc: function() { } });

    var group = new Kinetic.Group(_({
        x: position.x, y: position.y,
        draggable: true
    }).extend(options));

    var circle = new Kinetic.Circle(_({
        x: 0, y: 0,
        radius: 10,
        fill: 'white', stroke: 'red',
        strokeWidth: 2, 
        draggable: true
    }).extend(options));
    group.add(circle);

    group.add(new Kinetic.Text(_({
        x: -4, y: -6,
        text: letter, textFill: 'red',
        opacity: 1.0,
    }).extend(options)));
            
    function getPosition() {
        return {x: group.getX() + circle.getX(), y: group.getY() + circle.getY()};
    }

    group.position = ko.observable(getPosition());
    group.on('dragmove', function() { group.position(getPosition()) });
    
    return group;
}




/*
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
*/
