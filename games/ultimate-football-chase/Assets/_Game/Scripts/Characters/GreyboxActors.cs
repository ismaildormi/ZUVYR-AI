using UnityEngine;
using UltimateFootballChase.Gameplay;
using UltimateFootballChase.Core;

namespace UltimateFootballChase.Characters
{
    /// <summary>Temporary, wholly original/unbranded art; replace here without modifying movement or chase rules.</summary>
    public static class GreyboxActors
    {
        public static RunnerMotor CreatePlayer(RunConfig config)
        {
            var root = new GameObject("Runner - original placeholder");
            var body = GreyboxFactory.Primitive("Runner body - fictional, unbranded", PrimitiveType.Capsule,
                root.transform, new Vector3(0, .95f, 0), new Vector3(.85f, 1.6f, .85f), new Color(.21f, .88f, .68f));
            GreyboxFactory.Primitive("Runner head", PrimitiveType.Sphere, body,
                new Vector3(0, .57f, 0), new Vector3(.75f, .43f, .76f), new Color(.97f, .80f, .59f));
            OriginalRoster.AddGreyboxVariants(body);
            for (int side = -1; side <= 1; side += 2)
                GreyboxFactory.Primitive("Comic runner arm", PrimitiveType.Cube, body,
                    new Vector3(side * .65f, 0, .06f), new Vector3(.24f, .67f, .32f),
                    new Color(.21f, .88f, .68f));
            // Reusable, fictional effects; no purchased or real-club artwork.
            GreyboxFactory.Primitive("Magnet effect", PrimitiveType.Cylinder, root.transform,
                new Vector3(0, .1f, 0), new Vector3(3.1f, .04f, 3.1f), new Color(.98f, .35f, .28f)).gameObject.SetActive(false);
            GreyboxFactory.Primitive("Super shoes effect", PrimitiveType.Cube, root.transform,
                new Vector3(0, .18f, 0), new Vector3(1.2f, .22f, .8f), new Color(.54f, .95f, .3f)).gameObject.SetActive(false);
            Transform jetpack = GreyboxFactory.Primitive("Jetpack flame", PrimitiveType.Cylinder, root.transform,
                new Vector3(0, -.65f, -.38f), new Vector3(.55f, 1.1f, .55f), new Color(.95f, .53f, .14f));
            var particles = new GameObject("Jetpack smoke").AddComponent<ParticleSystem>();
            particles.transform.SetParent(jetpack, false);
            particles.transform.localPosition = new Vector3(0, -.6f, 0);
            var main = particles.main;
            main.loop = true;
            main.startLifetime = .38f;
            main.startSpeed = .7f;
            main.startSize = .22f;
            main.maxParticles = 35; // provisional low-budget mobile greybox effect
            main.startColor = new Color(.65f, .69f, .75f, .7f);
            var emission = particles.emission;
            emission.rateOverTime = 18f;
            particles.GetComponent<ParticleSystemRenderer>().sharedMaterial =
                GreyboxFactory.Material(new Color(.65f, .69f, .75f, .6f));
            jetpack.gameObject.SetActive(false);
            GreyboxFactory.Primitive("Hoverboard effect", PrimitiveType.Cube, root.transform,
                new Vector3(0, -.08f, 0), new Vector3(1.55f, .15f, 1.5f), new Color(1f, .8f, .23f)).gameObject.SetActive(false);
            RunnerMotor motor = root.AddComponent<RunnerMotor>();
            motor.Initialize(config, body);
            return motor;
        }

        public static Transform CreateChaser(out Renderer card)
        {
            var root = new GameObject("Fictional referee/chaser placeholder").transform;
            GreyboxFactory.Primitive("Chaser silhouette", PrimitiveType.Capsule, root,
                Vector3.up, new Vector3(.85f, 1f, .85f), new Color(.75f, .17f, .66f));
            card = GreyboxFactory.Primitive("Chaser card", PrimitiveType.Cube, root,
                new Vector3(.7f, 2.2f, .1f), new Vector3(.35f, .5f, .08f), new Color(.95f, .19f, .18f)).GetComponent<Renderer>();
            root.position = new Vector3(0, 0, -6f);
            return root;
        }
    }
}
