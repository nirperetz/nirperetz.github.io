export default /* glsl */`
	varying vec2 vUv;

	void main() {
		float a = 0.0002;
		vUv = uv;
		vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
		gl_Position = projectionMatrix * mvPosition;
		gl_Position.y = gl_Position.y ;
		gl_Position.y = max(gl_Position.y , 0.0005 - 0.99);
		float x = gl_Position.y+a;
		gl_Position.x = gl_Position.x + sign(gl_Position.x) * (a*2.0 / (x + 0.99));
	

	}
`;
		// gl_Position.y = gl_Position.y + 3.0;
		// gl_Position.y = max(gl_Position.y , 0.0);
		// gl_Position.x = gl_Position.x + sign(gl_Position.x) * (0.1 / (gl_Position.y+0.1));
		// gl_Position.y = gl_Position.y - 3.0;