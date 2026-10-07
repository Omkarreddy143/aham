using UnityEngine;

namespace Aham
{
    public static class AhamAppearance
    {
        public static Material Material(Color color, float metallic = 0, float smoothness = .3f)
        {
            Material material = new Material(Shader.Find("Standard"));
            material.color = color; material.SetFloat("_Metallic", metallic); material.SetFloat("_Glossiness", smoothness);
            return material;
        }
        public static GameObject Shape(PrimitiveType type, string name, Transform parent, Vector3 position, Vector3 scale, Material material)
        {
            GameObject shape = GameObject.CreatePrimitive(type); shape.name = name;
            shape.transform.SetParent(parent, false); shape.transform.localPosition = position; shape.transform.localScale = scale;
            Collider collider = shape.GetComponent<Collider>(); collider.enabled = false;
            if (Application.isPlaying) Object.Destroy(collider); else Object.DestroyImmediate(collider);
            shape.GetComponent<Renderer>().sharedMaterial = material; return shape;
        }
        public static GameObject RoundedBox(string name, Transform parent, Vector3 position, Vector3 size, float bevel, Material material)
        {
            GameObject shape = new GameObject(name); shape.transform.SetParent(parent, false); shape.transform.localPosition = position;
            const int steps = 6; int sideCount = (steps + 1) * (steps + 1);
            Vector3[] vertices = new Vector3[6 * sideCount], normals = new Vector3[6 * sideCount];
            Vector2[] uv = new Vector2[vertices.Length]; int[] triangles = new int[6 * steps * steps * 6];
            Vector3 half = size / 2, inner = half - Vector3.one * bevel;
            Vector3[] faces = {Vector3.right, Vector3.left, Vector3.up, Vector3.down, Vector3.forward, Vector3.back};
            int tri = 0;
            for (int face = 0; face < 6; face++)
            {
                Vector3 n = faces[face], u = face < 2 ? Vector3.forward : Vector3.right, v = Vector3.Cross(n, u);
                for (int y = 0; y <= steps; y++) for (int x = 0; x <= steps; x++)
                {
                    Vector3 p = Vector3.Scale(n + u * (2f * x / steps - 1) + v * (2f * y / steps - 1), half);
                    Vector3 center = new Vector3(Mathf.Clamp(p.x,-inner.x,inner.x),Mathf.Clamp(p.y,-inner.y,inner.y),Mathf.Clamp(p.z,-inner.z,inner.z));
                    int index = face * sideCount + y * (steps + 1) + x;
                    normals[index] = (p - center).normalized; vertices[index] = center + normals[index] * bevel; uv[index] = new Vector2(x/(float)steps,y/(float)steps);
                    if (x < steps && y < steps)
                    {
                        triangles[tri++] = index; triangles[tri++] = index + 1; triangles[tri++] = index + steps + 2;
                        triangles[tri++] = index; triangles[tri++] = index + steps + 2; triangles[tri++] = index + steps + 1;
                    }
                }
            }
            Mesh mesh = new Mesh { name = name + " rounded mesh", vertices = vertices, normals = normals, uv = uv, triangles = triangles };
            mesh.RecalculateBounds(); shape.AddComponent<MeshFilter>().sharedMesh = mesh; shape.AddComponent<MeshRenderer>().sharedMaterial = material;
            return shape;
        }
        public static GameObject Palm(Transform parent, Material material)
        {
            float[] z = {-.076f,-.06f,-.03f,.005f,.031f,.042f};
            float[] widths = {.026f,.033f,.043f,.046f,.045f,.041f};
            float[] heights = {.014f,.019f,.020f,.018f,.015f,.012f};
            const int sides = 32; Vector3[] vertices = new Vector3[z.Length * sides + 2]; int[] triangles = new int[(z.Length - 1)*sides*6+sides*6]; int t = 0;
            for (int ring=0; ring<z.Length; ring++) for (int i=0; i<sides; i++)
            { float a=i*2*Mathf.PI/sides; vertices[ring*sides+i]=new Vector3(Mathf.Cos(a)*widths[ring],Mathf.Sin(a)*heights[ring],z[ring]); }
            for (int ring=0;ring<z.Length-1;ring++) for(int i=0;i<sides;i++)
            { int a=ring*sides+i,b=ring*sides+(i+1)%sides,c=b+sides,d=a+sides; triangles[t++]=a;triangles[t++]=b;triangles[t++]=c;triangles[t++]=a;triangles[t++]=c;triangles[t++]=d; }
            int back=vertices.Length-2,front=vertices.Length-1;vertices[back]=new Vector3(0,0,z[0]);vertices[front]=new Vector3(0,0,z[z.Length-1]);
            for(int i=0;i<sides;i++) { int next=(i+1)%sides;triangles[t++]=back;triangles[t++]=next;triangles[t++]=i;triangles[t++]=front;triangles[t++]=(z.Length-1)*sides+i;triangles[t++]=(z.Length-1)*sides+next; }
            Mesh mesh=new Mesh{name="Anatomical palm",vertices=vertices,triangles=triangles};mesh.RecalculateNormals();mesh.RecalculateBounds();
            GameObject palm=new GameObject("Palm");palm.transform.SetParent(parent,false);palm.AddComponent<MeshFilter>().sharedMesh=mesh;palm.AddComponent<MeshRenderer>().sharedMaterial=material;return palm;
        }
    }
}
