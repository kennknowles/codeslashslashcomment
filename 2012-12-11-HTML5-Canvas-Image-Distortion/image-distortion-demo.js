var PIXEL_WIDTH = 4;

/* begin math */

function add(v0, v1) { return [v0[0] + v1[0], v0[1] + v1[1]]; }
function sub(v0, v1) { return [v0[0] - v1[0], v0[1] - v1[1]]; }
function dot(v0, v1) { return v0[0]*v1[0] + v0[1]*v1[1]; }
function mul(k, v) { return [k*v[0], k*v[1]]; }
function p2v(p) { return [p.x, p.y]; }

function barycentric_coords(triangle, p) {
    var a = triangle[0];
    var b = triangle[1];
    var c = triangle[2];

    var v0 = sub(c, a);
    var v1 = sub(b, a);
    var v2 = sub(p, a);

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

/* end math */

function circled_letter(letter, position, draggable) {        
    var options = draggable ? { draggable: draggable, } : { drawHitFunc: function() { } };

    var group = new Kinetic.Group(options);

    group.add(new Kinetic.Circle(_({
        x: position.x, y: position.y,
        radius: 10,
        fill: 'white', stroke: 'red',
        strokeWidth: 2, 
        draggable: true
    }).extend(options)));

    group.add(new Kinetic.Text(_({
        x: position.x - 4, y: position.y - 6,
        alight: 'center',
        text: letter, textFill: 'red',
        opacity: 1.0,
    }).extend(options)));
    
    return group;
}

/*
 * A KineticJS stage with a movable image and a frame around the outside.
 * A visual obvious triangle will be highlighted.
 */
function attach_input_stage(options) {
    options = _({
        container_size: {
            width: 400,
            height: 400
        },
        frame_size: {
            width: 200,
            height: 200
        }
    }).extend(options);

    var frame_upper_left = {
        x: (options.container_size.width - options.frame_size.width) / 2,
        y: (options.container_size.height - options.frame_size.height) / 2
    }
    var frame_lower_right = {
        x: options.container_size.width - frame_upper_left.x,
        y: options.container_size.height - frame_upper_left.y
    }

    var self = {};

    self.stage = new Kinetic.Stage({ 
        container: options.container_id,
        width: options.container_size.width,
        height: options.container_size.height
    });

    /* Movable image, starting at upper-left of frame */
    self.image_layer = new Kinetic.Layer();
    self.stage.add(self.image_layer);
    
    self.image = new Kinetic.Image({ draggable: true });
    self.image_layer.add(self.image);
    
    var img = new Image();
    img.onload = function() {
        self.image.setImage(img);
        self.image.setPosition((options.container_size.width - img.width) / 2, (options.container_size.height - img.height) / 2);
        self.image_layer.draw();
    };
    img.src = "picture.jpg";

    /* "Label" layer includes shadowing of "uninteresting" areas and a nice labeled outline */
    self.label_layer = new Kinetic.Layer();
    self.stage.add(self.label_layer);

    // KineticJS blended opacity afterwards, so one cannot simply overlap 1.0-opacity shapes and set the layer to < 1.0
    // So we draw complex shapes to frame the image.
    self.label_layer.add(new Kinetic.Polygon({ 
        points: [0, 0,
                 options.container_size.width, 0,
                 options.container_size.width, options.container_size.height],
        fill: 'white', strokeWidth: 0, opacity: 0.7,
        drawHitFunc: function() { }
    }));
    self.label_layer.add(new Kinetic.Polygon({
        points: [0,0,
                 0, options.container_size.height,
                 options.container_size.width, options.container_size.height,
                 frame_lower_right.x, frame_lower_right.y,
                 frame_upper_left.x, frame_lower_right.y,
                 frame_upper_left.x, frame_upper_left.y],
        fill: 'white', strokeWidth: 0, opacity: 0.7,
        drawHitFunc: function() { }
    }));

    // Solid red outline
    self.label_layer.add(new Kinetic.Polygon({
        points: [frame_upper_left.x, frame_upper_left.y,
                 frame_upper_left.x, frame_lower_right.y,
                 frame_lower_right.x, frame_lower_right.y],
        strokeWidth: 2, stroke: 'red',
        drawHitFunc: function() { }
    }));

    // Labeled corners
    var triangle_points = [
        { letter: 'A', position: frame_upper_left },
        { letter: 'B', position: { x: frame_upper_left.x, y: frame_lower_right.y } },
        { letter: 'C', position: frame_lower_right }
    ];

    _(triangle_points).each(function(corner) {
        self.label_layer.add(circled_letter(corner.letter, corner.position, false));
    });

    self.selected_triangle = _(triangle_points).map(function(point) { return point.position; });

    self.label_layer.draw();

    return self;
}

/*
 * Output Stage with a deformable triangle which will
 * always contain the contents of the framed triangle.
 */

function attach_output_stage(options) {
    options = _({
        container_size: {
            width: 400,
            height: 400
        },
        frame_size: {
            width: 200,
            height: 200
        }
    }).extend(options);
    
    var frame_upper_left = {
        x: (options.container_size.width - options.frame_size.width) / 2,
        y: (options.container_size.height - options.frame_size.height) / 2
    }
    var frame_lower_right = {
        x: options.container_size.width - frame_upper_left.x,
        y: options.container_size.height - frame_upper_left.y
    }

    var self = {};
    
    self.stage = new Kinetic.Stage({ container: 'output-container', width: options.container_size.width, height: options.container_size.height });
    
    /* Drawing layer for direct blits */
    self.drawing_layer = new Kinetic.Layer();
    self.stage.add(self.drawing_layer);
    
    var drawing_context = self.drawing_layer.getCanvas().getContext('2d');
    //var drawing_context = document.getElementById('wtf-container').getContext('2d');

    self.update_and_draw = function() {
        var triangle = self.current_triangle();

        self.outline.setPoints(_(triangle).flatten());

        var input_data = options.input_context.getImageData(0, 0, options.input_context.canvas.width, options.input_context.canvas.height);
        var image_data = drawing_context.getImageData(0, 0, drawing_context.canvas.width, drawing_context.canvas.height);

        var input_pixel_data = input_data.data;
        var pixel_data = image_data.data;

        var original_a = triangle[0];
        var original_ba = sub(triangle[1], original_a);
        var original_ca = sub(triangle[2], original_a);
        
        var a = p2v(options.input_triangle[0])
        var ba = sub(p2v(options.input_triangle[1]), p2v(options.input_triangle[0]));
        var ca = sub(p2v(options.input_triangle[2]), p2v(options.input_triangle[0]));

        // Trying to use low-level operations to make blitting "reasonably" fast
        for(var x = 0; x < image_data.width; x++) {
            for(var y = 0; y < image_data.height; y++) {
                var uv = barycentric_coords(triangle, [x, y]);
                var in_triangle = (uv[0] >= 0) && (uv[1] >= 0) && (uv[0] + uv[1] <= 1);

                var pixel_start = PIXEL_WIDTH * (x + y * image_data.width); 

                if (in_triangle) {
                    input_xy = add(a, add( mul(uv[0], ca), mul(uv[1], ba)));

                    input_pixel_start = PIXEL_WIDTH * (Math.floor(input_xy[0]) + Math.floor(input_xy[1]) * input_data.width);

                    pixel_data[pixel_start] = input_pixel_data[input_pixel_start];
                    pixel_data[pixel_start+1] = input_pixel_data[input_pixel_start+1];
                    pixel_data[pixel_start+2] = input_pixel_data[input_pixel_start+2];
                    pixel_data[pixel_start+3] = input_pixel_data[input_pixel_start+3];

                } else {
                    pixel_data[pixel_start] = 255;
                    pixel_data[pixel_start+1] = 255;
                    pixel_data[pixel_start+2] = 255;
                    pixel_data[pixel_start+3] = 255;
                }
            }
        }

        drawing_context.putImageData(image_data, 0, 0);
    }

    /* Control layer for deforming the output triangle */
    self.control_layer = new Kinetic.Layer();
    self.stage.add(self.control_layer);
    
    self.outline = new Kinetic.Polygon({
        points: [frame_upper_left.x, frame_upper_left.y,
                 frame_upper_left.x, frame_lower_right.y,
                 frame_lower_right.x, frame_lower_right.y],
        strokeWidth: 2, stroke: 'red',
        drawHitFunc: function() { }
    })
    self.control_layer.add(self.outline);
    
    self.corners = _([
        { letter: 'A', position: frame_upper_left },
        { letter: 'B', position: { x: frame_upper_left.x, y: frame_lower_right.y } },
        { letter: 'C', position: frame_lower_right }
    ]).map(function(corner) {
        var control = circled_letter(corner.letter, corner.position, true);
        self.control_layer.add(control);
        control.on('dragmove', self.update_and_draw); // TODO: throttle
        return control;
    });

    self.current_triangle = function() {
        return _(self.corners).map(function(corner_group) {
            var circle = corner_group.getChildren()[0];
            return [corner_group.getX() + circle.getX(), corner_group.getY() + circle.getY()];
        });
    }

    self.control_layer.draw();
    
    return self;
}

$(document).ready(function() {
    var input_stage = attach_input_stage({ container_id: 'input-container' });

    var output_stage = attach_output_stage({ 
        container_id: 'output-container',
        input_context: input_stage.image_layer.getCanvas().getContext('2d'),
        input_triangle: input_stage.selected_triangle
    });

    output_stage.update_and_draw();

    input_stage.image.on('dragmove', output_stage.update_and_draw);

    /*
    function output_texture(image_data, config) {
        var triangle = output_triangle();

        console.log('Blitting', image_data.width, 'x', image_data.height);
        
        _(_.range(0, image_data.width)).each(function(x) {
            _(_.range(0, image_data.height)).each(function(y) {
            });
        });
    }

    function all_black(image_data) {
        console.log('Blitting', image_data.width, 'x', image_data.height);

        _(_.range(0, image_data.width)).each(function(x) {
            _(_.range(0, image_data.height)).each(function(y) {
                setPixel(image_data, x, y, [0, 0, 0, 255]);
            });
        });
    }

    output_image.on('click', function() {
        var mouse = output_stage.getMousePosition();
        var uv = barycentric_coords(output_triangle(), [mouse.x, mouse.y]);
        var in_triangle = (uv[0] >= 0) && (uv[1] >= 0) && (uv[0] + uv[1] <= 1);
        
        console.log(in_triangle ? 'In' : 'Out', uv);
    });
    */
});
